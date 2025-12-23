
import React, { useEffect } from 'react';
import { useStore } from './store';
import UploadZone from './components/UploadZone';
import Editor from './components/Editor';

const STORAGE_KEY = 'beemath_draft_questions';

const App: React.FC = () => {
  const { questions, setQuestions } = useStore();

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        if (Array.isArray(parsedData) && parsedData.length > 0) {
          // Ask user if they want to recover
          const confirmed = window.confirm('Tìm thấy bản nháp chưa hoàn thành. Bạn có muốn khôi phục không?');
          if (confirmed) {
            setQuestions(parsedData);
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load draft:", e);
    }
  }, [setQuestions]);

  // Auto-save questions to localStorage when they change
  useEffect(() => {
    if (questions.length > 0) {
      try {
        const dataToSave = JSON.stringify(questions);
        localStorage.setItem(STORAGE_KEY, dataToSave);
      } catch (e: any) {
        // Handle QuotaExceededError
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn("LocalStorage full. Attempting to save without images...");
          // Try to save without figure_images to save space
          try {
            const lightQuestions = questions.map(q => {
              const { figure_image, ...rest } = q;
              return rest;
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lightQuestions));
          } catch (e2) {
            console.error("Still cannot save to localStorage.", e2);
          }
        }
      }
    }
  }, [questions]);

  // If we have questions, show the editor. Otherwise show upload.
  const isEditorMode = questions.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {isEditorMode ? (
        <Editor />
      ) : (
        <div className="container mx-auto px-4 py-12">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-extrabold text-gray-900 mb-2">
              <span className="text-bee-500">BeeMath</span> Editor
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Công cụ số hóa đề thi toán học từ ảnh. Chỉnh sửa công thức LaTeX dễ dàng và xuất bản Word chỉ trong vài giây.
            </p>
          </header>
          
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-4xl mx-auto">
            <UploadZone />
          </div>

          <footer className="text-center mt-12 text-gray-400 text-sm">
            Powered by Google Gemini AI & React
          </footer>
        </div>
      )}
    </div>
  );
};

export default App;
