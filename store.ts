import { create } from 'zustand';
import { AppState, Question, TrueFalseGroupQuestion } from './types';

interface Store extends AppState {
  // Data
  pdfPages: string[];
  
  // Background Processing Status
  solvingStatus: Record<string, boolean>; // map[questionId] -> isSolving

  // History Stacks for Undo/Redo
  past: Question[][];
  future: Question[][];

  // Bulk Selection Mode
  isSelectionMode: boolean;
  selectedQuestionIds: string[];

  // Actions
  setPdfPages: (pages: string[]) => void;
  setImage: (base64: string | null) => void;
  setProcessing: (status: boolean) => void;
  
  // Background Actions
  setQuestionSolvingStatus: (id: string, status: boolean) => void;
  
  // Data Actions (wrapped with history)
  setQuestions: (questions: Question[]) => void; // This resets history usually
  addQuestion: (question: Question) => void;
  addQuestions: (questions: Question[]) => void; // Batch add
  updateQuestion: (id: string, updates: Partial<Question>) => void;
  deleteQuestion: (id: string) => void;
  reorderQuestions: (fromIndex: number, toIndex: number) => void;
  duplicateQuestion: (id: string) => void;
  deleteMultipleQuestions: (ids: string[]) => void;
  clearAll: () => void;
  
  // Selection & UI
  setSelectedQuestion: (id: string | null) => void;
  setError: (msg: string | null) => void;
  setCroppingForQuestionId: (id: string | null) => void;
  toggleSelectionMode: () => void;
  toggleQuestionSelection: (id: string) => void;
  selectAllQuestions: () => void;
  clearSelection: () => void;

  // History Actions
  undo: () => void;
  redo: () => void;
  resetHistory: () => void;
}

// Helper to push state to history
const pushToHistory = (state: Store, newQuestions: Question[]) => {
  const newPast = [...state.past, state.questions];
  // Limit history to 50 steps to save memory
  if (newPast.length > 50) newPast.shift();
  
  return {
    questions: newQuestions,
    past: newPast,
    future: [] // Clear future when a new action is taken
  };
};

export const useStore = create<Store>((set) => ({
  questions: [],
  imageBase64: null,
  pdfPages: [],
  isProcessing: false,
  selectedQuestionId: null,
  error: null,
  croppingForQuestionId: null,
  solvingStatus: {},
  
  past: [],
  future: [],

  isSelectionMode: false,
  selectedQuestionIds: [],

  setPdfPages: (pages) => set({ pdfPages: pages }),
  setImage: (base64) => set({ imageBase64: base64 }),
  setProcessing: (status) => set({ isProcessing: status }),

  setQuestionSolvingStatus: (id, status) => set((state) => ({
    solvingStatus: { ...state.solvingStatus, [id]: status }
  })),

  // Setting questions directly (usually from upload or load) resets history
  setQuestions: (questions) => set({ questions, past: [], future: [] }),

  addQuestion: (question) => set((state) => 
    pushToHistory(state, [...state.questions, question])
  ),

  // New action to add multiple questions at once without overwriting existing ones
  addQuestions: (newQuestions) => set((state) => 
    pushToHistory(state, [...state.questions, ...newQuestions])
  ),
  
  updateQuestion: (id, updates) => set((state) => {
    // Check if the question actually exists to avoid errors
    const exists = state.questions.some(q => q.id === id);
    if (!exists) return {};

    const newQuestions = state.questions.map((q) => 
      (q.id === id ? { ...q, ...updates } as Question : q)
    );
    // Note: We might choose NOT to push to history for background updates (like solving)
    // to prevent the undo stack from being flooded with "Partial solve" states.
    // For now, we keep it simple.
    return { questions: newQuestions };
  }),

  deleteQuestion: (id) => set((state) => {
    const newQuestions = state.questions.filter((q) => q.id !== id);
    const newSolvingStatus = { ...state.solvingStatus };
    delete newSolvingStatus[id];
    
    return {
      ...pushToHistory(state, newQuestions),
      solvingStatus: newSolvingStatus,
      selectedQuestionId: state.selectedQuestionId === id ? null : state.selectedQuestionId
    };
  }),

  reorderQuestions: (fromIndex, toIndex) => set((state) => {
    const result = [...state.questions];
    const [removed] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, removed);
    return pushToHistory(state, result);
  }),

  duplicateQuestion: (id) => set((state) => {
    const index = state.questions.findIndex(q => q.id === id);
    if (index === -1) return {};

    const original = state.questions[index];
    
    // Generate new IDs for the duplicated question and its sub-questions
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    const newQuestion = {
      ...original,
      id: newId,
      content: `${original.content} (Sao chép)`,
    } as Question;

    if (newQuestion.type === 'true_false_group') {
      (newQuestion as TrueFalseGroupQuestion).sub_questions = (newQuestion as TrueFalseGroupQuestion).sub_questions.map(sq => ({
        ...sq,
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2)
      }));
    }

    const newQuestions = [...state.questions];
    newQuestions.splice(index + 1, 0, newQuestion);

    return pushToHistory(state, newQuestions);
  }),

  deleteMultipleQuestions: (ids) => set((state) => {
    const newQuestions = state.questions.filter(q => !ids.includes(q.id));
    const newSolvingStatus = { ...state.solvingStatus };
    ids.forEach(id => delete newSolvingStatus[id]);

    return {
      ...pushToHistory(state, newQuestions),
      solvingStatus: newSolvingStatus,
      selectedQuestionIds: [],
      isSelectionMode: false 
    };
  }),

  clearAll: () => set({
    questions: [],
    past: [],
    future: [],
    pdfPages: [],
    imageBase64: null,
    selectedQuestionIds: [],
    isSelectionMode: false,
    error: null,
    solvingStatus: {}
  }),

  setSelectedQuestion: (id) => set({ selectedQuestionId: id }),
  setError: (msg) => set({ error: msg }),
  setCroppingForQuestionId: (id) => set({ croppingForQuestionId: id }),

  // Selection Actions
  toggleSelectionMode: () => set((state) => ({ 
    isSelectionMode: !state.isSelectionMode,
    selectedQuestionIds: [] // Clear selection when toggling
  })),

  toggleQuestionSelection: (id) => set((state) => {
    const isSelected = state.selectedQuestionIds.includes(id);
    return {
      selectedQuestionIds: isSelected 
        ? state.selectedQuestionIds.filter(qid => qid !== id)
        : [...state.selectedQuestionIds, id]
    };
  }),

  selectAllQuestions: () => set((state) => ({
    selectedQuestionIds: state.questions.map(q => q.id)
  })),

  clearSelection: () => set({ selectedQuestionIds: [] }),

  // --- Undo / Redo Implementation ---
  
  undo: () => set((state) => {
    if (state.past.length === 0) return {}; // Nothing to undo

    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, -1);

    return {
      questions: previous,
      past: newPast,
      future: [state.questions, ...state.future]
    };
  }),

  redo: () => set((state) => {
    if (state.future.length === 0) return {}; // Nothing to redo

    const next = state.future[0];
    const newFuture = state.future.slice(1);

    return {
      questions: next,
      past: [...state.past, state.questions],
      future: newFuture
    };
  }),

  resetHistory: () => set({ past: [], future: [] })
}));