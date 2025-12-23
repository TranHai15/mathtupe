
import katex from 'katex';
import { Question, MultipleChoiceQuestion, TrueFalseGroupQuestion, ShortAnswerQuestion, EssayQuestion } from '../types';

/**
 * Chuyển đổi chuỗi LaTeX thành MathML để Word có thể hiển thị.
 */
const convertLatexToMathML = (latex: string, displayMode: boolean): string => {
  try {
    // Katex hỗ trợ output là 'mathml', đây là định dạng Word hiểu được
    return katex.renderToString(latex, {
      displayMode,
      output: 'mathml',
      throwOnError: false,
    });
  } catch (e) {
    console.error("Lỗi convert MathML:", e);
    return latex;
  }
};

/**
 * Xử lý văn bản chứa lẫn lộn Text và LaTeX ($...$ hoặc $$...$$)
 */
const processText = (text: string): string => {
  if (!text) return '';
  
  // Tách chuỗi dựa trên ký hiệu $...$ hoặc $$...$$
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);

  return parts.map(part => {
    if (part.startsWith('$$') && part.endsWith('$$')) {
      // Công thức block
      const math = part.slice(2, -2);
      return `<div style="text-align: center; margin: 10px 0;">${convertLatexToMathML(math, true)}</div>`;
    } else if (part.startsWith('$') && part.endsWith('$')) {
      // Công thức inline
      const math = part.slice(1, -1);
      return convertLatexToMathML(math, false);
    } else {
      // Text thường: Cần escape các ký tự đặc biệt của HTML
      return part
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");
    }
  }).join('');
};

/**
 * Tạo nội dung HTML cho toàn bộ đề thi
 * @param questions Danh sách câu hỏi
 * @param includeAnswers Nếu true: Hiện đáp án tô đỏ, bảng đúng sai và lời giải. Nếu false: Chỉ hiện đề.
 */
export const generateWordContent = (questions: Question[], includeAnswers: boolean): string => {
  const title = includeAnswers ? "ĐÁP ÁN VÀ HƯỚNG DẪN GIẢI CHI TIẾT" : "ĐỀ THI TOÁN HỌC (BEEMATH)";
  
  let bodyContent = `
    <h1 style="text-align: center; font-size: 16pt; margin-bottom: 20px;">${title}</h1>
    <p style="text-align: center; font-style: italic;">Được tạo tự động bởi BeeMath Editor</p>
    <hr/>
  `;

  questions.forEach((q, index) => {
    bodyContent += `<div style="margin-bottom: 15px; page-break-inside: avoid;">`;
    
    // Tiêu đề câu hỏi
    bodyContent += `<p style="font-weight: bold; margin-bottom: 5px;">Câu ${index + 1}:</p>`;
    
    // Nội dung câu hỏi
    bodyContent += `<div style="margin-bottom: 10px;">${processText(q.content)}</div>`;

    // Chèn hình ảnh nếu có
    if (q.figure_image) {
      bodyContent += `
        <div style="text-align: center; margin: 10px 0;">
          <img src="${q.figure_image}" style="max-width: 300px; max-height: 300px;" />
        </div>
      `;
    }

    // Render các loại câu hỏi cụ thể
    if (q.type === 'multiple_choice') {
      const mc = q as MultipleChoiceQuestion;
      bodyContent += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;"><tr>`;
      mc.options.forEach((opt, i) => {
        const label = String.fromCharCode(65 + i);
        const isCorrect = mc.correct_option === label;
        
        // Chỉ tô màu đáp án nếu includeAnswers = true
        const style = (includeAnswers && isCorrect) ? "color: red; font-weight: bold;" : "";
        
        if (i % 2 === 0 && i > 0) bodyContent += `</tr><tr>`; 
        
        bodyContent += `<td style="width: 50%; padding: 5px; ${style}">
          <strong>${label}.</strong> ${processText(opt)}
        </td>`;
      });
      bodyContent += `</tr></table>`;
    } 
    else if (q.type === 'true_false_group') {
      const tf = q as TrueFalseGroupQuestion;
      // Sửa đổi format Đúng/Sai: Không dùng bảng nữa, dùng danh sách a, b, c, d
      bodyContent += `<div style="margin-left: 20px;">`;
      tf.sub_questions.forEach((sub, i) => {
        const label = String.fromCharCode(97 + i); // a, b, c, d...
        
        // Nếu xuất đáp án thì hiện thêm (Đúng) hoặc (Sai) bên cạnh
        let answerText = "";
        if (includeAnswers) {
          answerText = sub.is_correct 
            ? ` <span style="color: red; font-weight: bold; margin-left: 10px;">&#8594; ĐÚNG</span>` 
            : ` <span style="color: red; font-weight: bold; margin-left: 10px;">&#8594; SAI</span>`;
        }

        bodyContent += `<p style="margin-bottom: 5px;">
          <strong>${label})</strong> ${processText(sub.content)}${answerText}
        </p>`;
      });
      bodyContent += `</div>`;
    }
    else if (q.type === 'short_answer') {
      const sa = q as ShortAnswerQuestion;
      // Chỉ hiện đáp án điền khuyết nếu includeAnswers = true
      if (includeAnswers) {
        bodyContent += `<p><strong>Đáp án:</strong> <span style="color: blue;">${processText(sa.correct_answer)}</span></p>`;
      } else {
        bodyContent += `<p><strong>Trả lời:</strong> ...........................................................</p>`;
      }
    }
    else if (q.type === 'essay') {
      const eq = q as EssayQuestion;
      // Chỉ hiện lời giải tham khảo nếu includeAnswers = true
      if (includeAnswers) {
        bodyContent += `<div style="border: 1px dashed #999; padding: 10px; background-color: #fafafa;">
          <strong>Lời giải tham khảo:</strong><br/>
          ${processText(eq.reference_solution)}
        </div>`;
      } else {
         bodyContent += `<div style="height: 100px; border: 1px solid #eee;"></div>`; // Khoảng trống để làm bài
      }
    }

    // Phần hướng dẫn giải chung (Chỉ hiện khi xuất đáp án)
    if (includeAnswers && q.type !== 'essay' && q.solution_guide) {
       bodyContent += `<div style="margin-top: 5px; font-size: 10pt; color: #555;">
        <em>Hướng dẫn:</em> ${processText(q.solution_guide)}
       </div>`;
    }

    bodyContent += `</div>`;
  });

  return `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; }
        table { border-collapse: collapse; }
        @page {
          mso-page-orientation: portrait;
          size: 21cm 29.7cm;
          margin: 2.54cm 2.54cm 2.54cm 2.54cm;
        }
      </style>
    </head>
    <body>${bodyContent}</body>
    </html>
  `;
};
