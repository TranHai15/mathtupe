
export type QuestionType = 'multiple_choice' | 'true_false_group' | 'short_answer' | 'essay';

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  content: string;
  solution_guide: string;
  topic?: string;
  difficulty?: string; // Changed from enum to string to allow custom user input (e.g., "Vận dụng cao")
  figure_image?: string; // Base64 string of the cropped image
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple_choice';
  options: string[]; // Array of 4 strings
  correct_option: 'A' | 'B' | 'C' | 'D';
}

export interface SubQuestion {
  id: string;
  content: string;
  is_correct: boolean;
}

export interface TrueFalseGroupQuestion extends BaseQuestion {
  type: 'true_false_group';
  sub_questions: SubQuestion[];
}

export interface ShortAnswerQuestion extends BaseQuestion {
  type: 'short_answer';
  correct_answer: string;
}

export interface EssayQuestion extends BaseQuestion {
  type: 'essay';
  reference_solution: string;
}

export type Question = 
  | MultipleChoiceQuestion 
  | TrueFalseGroupQuestion 
  | ShortAnswerQuestion 
  | EssayQuestion;

export interface AppState {
  questions: Question[];
  imageBase64: string | null;
  isProcessing: boolean;
  selectedQuestionId: string | null;
  error: string | null;
  croppingForQuestionId: string | null; // ID of the question waiting for an image crop
}
