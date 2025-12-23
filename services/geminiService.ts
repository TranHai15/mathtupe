import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Question } from "../types";

// --- Concurrency & Retry Logic with PRIORITY ---
const apiKey = import.meta.env.VITE_API_KEY;
const modelAI = import.meta.env.VITE_MODEL_AI;

type QueueItem = {
  task: () => Promise<void>;
  priority: boolean;
};

class PromiseQueue {
  private queue: QueueItem[] = [];
  private running = 0;
  private readonly concurrency: number;

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  add<T>(task: () => Promise<T>, priority: boolean = false): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };

      const item: QueueItem = { task: wrappedTask, priority };

      if (priority) {
        const insertIndex = this.queue.findIndex((i) => !i.priority);
        if (insertIndex === -1) {
          this.queue.push(item);
        } else {
          this.queue.splice(insertIndex, 0, item);
        }
      } else {
        this.queue.push(item);
      }

      this.run();
    });
  }

  private run() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        this.running++;
        item.task().finally(() => {
          this.running--;
          this.run();
        });
      }
    }
  }
}

// Keep concurrency at 1 to match rate limits
const solvingQueue = new PromiseQueue(1);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Reduced retries from 4 to 2 to save API calls
async function retryOperation<T>(
  operation: () => Promise<T>,
  retries = 2,
  delay = 2000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (retries <= 0) throw error;

    const isRateLimitError =
      error.code === 429 ||
      error.status === 429 ||
      error.status === "RESOURCE_EXHAUSTED" ||
      (error.message &&
        (error.message.includes("429") ||
          error.message.toLowerCase().includes("quota") ||
          error.message.toLowerCase().includes("exhausted")));

    if (isRateLimitError) {
      const waitTime = 5000 + Math.random() * 3000;
      console.warn(
        `Gemini Quota Exceeded (429). Waiting ${Math.round(
          waitTime / 1000
        )}s before retry... Attempts left: ${retries}`
      );
      await wait(waitTime);
      return retryOperation(operation, retries - 1, delay * 2);
    }

    const isNetworkError =
      error.message &&
      (error.message.includes("xhr") ||
        error.message.includes("fetch") ||
        error.message.includes("network") ||
        error.message.includes("Failed to fetch"));
    const isServerError =
      error.code === 500 ||
      error.code === 503 ||
      error.status === 500 ||
      error.status === 503;
    const isRpcError = error.message && error.message.includes("error code: 6");

    if (isNetworkError || isServerError || isRpcError) {
      console.warn(
        `Gemini API Error (${error.message}). Retrying in ${delay}ms... Attempts left: ${retries}`
      );
      await wait(delay);
      return retryOperation(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

// --- Schemas ---

const subQuestionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    content: { type: Type.STRING },
    is_correct: { type: Type.BOOLEAN },
  },
  required: ["content", "is_correct"],
};

const extractionItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      enum: ["multiple_choice", "true_false_group", "short_answer", "essay"],
    },
    content: { type: Type.STRING },
    solution_guide: { type: Type.STRING },
    options: { type: Type.ARRAY, items: { type: Type.STRING } },
    correct_option: { type: Type.STRING, enum: ["A", "B", "C", "D"] },
    sub_questions: { type: Type.ARRAY, items: subQuestionSchema },
    correct_answer: { type: Type.STRING },
    reference_solution: { type: Type.STRING },
    topic: { type: Type.STRING },
    difficulty: { type: Type.STRING },
  },
  required: ["type", "content", "solution_guide"], // solution_guide required immediately
};

const extractionListSchema: Schema = {
  type: Type.ARRAY,
  items: extractionItemSchema,
};

const batchSolutionItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    solution_guide: { type: Type.STRING },
    correct_option: { type: Type.STRING, enum: ["A", "B", "C", "D"] },
    correct_answer: { type: Type.STRING },
    reference_solution: { type: Type.STRING },
    sub_questions_status: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          is_correct: { type: Type.BOOLEAN },
        },
      },
    },
  },
  required: ["id", "solution_guide"],
};

const batchSolutionListSchema: Schema = {
  type: Type.ARRAY,
  items: batchSolutionItemSchema,
};

/**
 * Helper to safely parse JSON that might be truncated or contain markdown blocks
 */
const safeJsonParse = (jsonString: string): any => {
  let cleanStr = jsonString
    .replace(/^```json\s*/, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleanStr);
  } catch (e) {
    const trimmed = cleanStr.trim();
    if (trimmed.startsWith("[")) {
      const lastObjectEnd = trimmed.lastIndexOf("}");
      if (lastObjectEnd !== -1) {
        const repaired = trimmed.substring(0, lastObjectEnd + 1) + "]";
        try {
          return JSON.parse(repaired);
        } catch (e2) {}
      }
    }
    throw e;
  }
};

/**
 * Creates a strict schema based on the question type to force Gemini to provide specific fields.
 */
const getStrictSchemaForType = (type: string): Schema => {
  const commonProps = {
    type: { type: Type.STRING, enum: [type] },
    content: { type: Type.STRING },
    solution_guide: { type: Type.STRING },
    topic: { type: Type.STRING },
    difficulty: { type: Type.STRING },
  };

  const commonRequired = ["type", "content", "solution_guide"];

  switch (type) {
    case "multiple_choice":
      return {
        type: Type.OBJECT,
        properties: {
          ...commonProps,
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correct_option: { type: Type.STRING, enum: ["A", "B", "C", "D"] },
        },
        required: [...commonRequired, "options", "correct_option"],
      };

    case "true_false_group":
      return {
        type: Type.OBJECT,
        properties: {
          ...commonProps,
          sub_questions: { type: Type.ARRAY, items: subQuestionSchema },
        },
        required: [...commonRequired, "sub_questions"],
      };

    case "short_answer":
      return {
        type: Type.OBJECT,
        properties: {
          ...commonProps,
          correct_answer: { type: Type.STRING },
        },
        required: [...commonRequired, "correct_answer"],
      };

    case "essay":
      return {
        type: Type.OBJECT,
        properties: {
          ...commonProps,
          reference_solution: { type: Type.STRING },
        },
        required: [...commonRequired, "reference_solution"],
      };

    default:
      return extractionItemSchema;
  }
};

/**
 * SANITIZATION: Ensures the AI result matches the UI expectations strictly.
 */
const validateAndFixData = (data: any, originalType: string): any => {
  // If AI returns an Array, take the first element
  if (Array.isArray(data)) {
    data = data.length > 0 ? data[0] : {};
  }

  // Ensure mandatory fields exist
  data.content = data.content || "Nội dung câu hỏi...";
  data.solution_guide = data.solution_guide || "(AI chưa tạo lời giải)";

  // Fix based on type
  if (originalType === "multiple_choice") {
    if (!Array.isArray(data.options) || data.options.length === 0) {
      data.options = [
        "(Chưa có đáp án)",
        "(Chưa có đáp án)",
        "(Chưa có đáp án)",
        "(Chưa có đáp án)",
      ];
    }
    if (!data.correct_option) data.correct_option = "A";
  } else if (originalType === "true_false_group") {
    if (!Array.isArray(data.sub_questions)) {
      data.sub_questions = [];
    }
    // Ensure sub_questions have IDs
    data.sub_questions = data.sub_questions.map((sq: any) => ({
      ...sq,
      id: crypto.randomUUID(),
      content: sq.content || "",
      is_correct: !!sq.is_correct,
    }));
  } else if (originalType === "short_answer") {
    if (typeof data.correct_answer !== "string") {
      data.correct_answer = String(data.correct_answer || "");
    }
  } else if (originalType === "essay") {
    if (!data.reference_solution) data.reference_solution = "";
  }

  return data;
};

// --- API Functions ---

export const extractQuestionsFromImage = async (
  base64Image: string
): Promise<Question[]> => {
  return solvingQueue.add(
    () =>
      retryOperation(
        async () => {
          const ai = new GoogleGenAI({ apiKey: apiKey });
          const cleanBase64 = base64Image.split(",")[1] || base64Image;

          // OPTIMIZATION: Combine Extraction + Solving into ONE call
          const response = await ai.models.generateContent({
            model: modelAI,
            contents: {
              parts: [
                { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } },
                {
                  text: "OCR và GIẢI BÀI. Trích xuất câu hỏi và tìm đáp án đúng/lời giải ngay lập tức.",
                },
              ],
            },
            config: {
              systemInstruction: `Bạn là ứng dụng hỗ trợ giáo viên. 
        1. Trích xuất câu hỏi từ ảnh (giữ nguyên LaTeX).
        2. GIẢI LUÔN CÂU HỎI ĐÓ. 
        3. Điền vào 'solution_guide' và 'correct_option'/'correct_answer'.
        4. Trả về JSON mảng phẳng.`,
              responseMimeType: "application/json",
              responseSchema: extractionListSchema,
              temperature: 0.1, // Low temp for accuracy
            },
          });

          if (response.text) {
            const data = safeJsonParse(response.text);
            if (Array.isArray(data)) {
              return data.map((q: any) => ({
                ...validateAndFixData(q, q.type), // Validate extracted data
                id: crypto.randomUUID(),
              }));
            }
          }
          throw new Error("No data returned from AI");
        },
        2,
        3000
      ),
    true
  ); // High Priority
};

// Keep this for manual "Solve" button if needed later, but usage is minimized
export const solveQuestionBatch = async (
  questions: Question[]
): Promise<any[]> => {
  return solvingQueue.add(
    () =>
      retryOperation(async () => {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const simplifiedInput = questions.map((q) => ({
          id: q.id,
          type: q.type,
          content: q.content,
          options: (q as any).options,
          sub_questions: (q as any).sub_questions?.map(
            (sq: any, idx: number) => ({ index: idx, content: sq.content })
          ),
        }));

        const prompt = `
      Bạn là GIÁO VIÊN TOÁN. Hãy giải danh sách câu hỏi sau.
      INPUT: ${JSON.stringify(simplifiedInput)}
      YÊU CẦU: Trả về JSON Array chứa lời giải ('solution_guide') và đáp án đúng.
    `;

        const response = await ai.models.generateContent({
          model: modelAI,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: batchSolutionListSchema,
            temperature: 0.2,
          },
        });

        if (response.text) {
          return safeJsonParse(response.text);
        }
        throw new Error("Batch solve returned empty.");
      }),
    false
  ); // Low Priority
};

export const solveSpecificQuestion = async (
  question: Question
): Promise<Question> => {
  return solvingQueue.add(
    () =>
      retryOperation(async () => {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const { figure_image, ...cleanQuestion } = question;
        const strictSchema = getStrictSchemaForType(question.type);

        const response = await ai.models.generateContent({
          model: modelAI,
          contents: `Giải câu này: ${JSON.stringify(cleanQuestion)}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: strictSchema,
          },
        });
        if (response.text) {
          let res = safeJsonParse(response.text);
          res = validateAndFixData(res, question.type);
          return { ...question, ...res };
        }
        throw new Error("Empty");
      }),
    false
  );
};

// Regeneration (User triggered)
export const regenerateQuestionData = async (
  question: Question,
  options: any
): Promise<Question> => {
  return solvingQueue.add(
    () =>
      retryOperation(async () => {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const diffText =
          options.difficulty || question.difficulty || "Tương đương";
        const topicText = options.topic || question.topic || "Tương đương";
        const contextInstruction =
          options.instruction || "Giữ nguyên ngữ cảnh, thay đổi số liệu.";

        const { figure_image, id, ...cleanQuestion } = question;
        const strictSchema = getStrictSchemaForType(question.type);

        const prompt = `
        Đóng vai trò giáo viên Toán. TẠO CÂU HỎI MỚI dựa trên câu gốc:
        ${JSON.stringify(cleanQuestion)}
        
        YÊU CẦU:
        1. Tạo câu hỏi mới cùng dạng, cùng chủ đề: ${topicText}.
        2. Độ khó: ${diffText}.
        3. ${contextInstruction}
        4. QUAN TRỌNG: TỰ GIẢI CÂU HỎI VỪA TẠO.
           - Điền đáp án đúng vào 'correct_option' / 'correct_answer'.
           - Điền hướng dẫn giải vào 'solution_guide'.
        5. Trả về JSON Object đầy đủ.
      `;

        const response = await ai.models.generateContent({
          model: modelAI,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: strictSchema,
            temperature: 0.9,
          },
        });

        if (response.text) {
          let newData = safeJsonParse(response.text);

          // Critical Step: Validate and Fix missing fields before returning to UI
          newData = validateAndFixData(newData, question.type);

          return {
            ...newData,
            id: question.id, // FORCE Keep original ID
            type: question.type, // FORCE Keep original Type
            figure_image: question.figure_image,
          };
        }
        throw new Error("Empty response from regeneration");
      }),
    true
  );
};
