
import React, { useState, useRef } from 'react';
import { Question, MultipleChoiceQuestion, TrueFalseGroupQuestion, ShortAnswerQuestion, EssayQuestion } from '../types';
import { useStore } from '../store';
import { regenerateQuestionData } from '../services/geminiService';
import LatexPreview from './LatexPreview';
import { Trash2, RefreshCw, ChevronDown, ChevronUp, GripVertical, Image as ImageIcon, Crop, X, Upload as UploadIcon, Sparkles, Plus, Copy, Square, CheckSquare, Loader2, BrainCircuit } from 'lucide-react';

// --- Helper: Math Symbol Buttons ---
const MATH_SYMBOLS = [
  { label: 'x²', latex: '^{2}', tooltip: 'Bình phương' },
  { label: '√x', latex: '\\sqrt{}', tooltip: 'Căn bậc hai' },
  { label: 'a/b', latex: '\\frac{}{}', tooltip: 'Phân số' },
  { label: 'xₙ', latex: '_{}', tooltip: 'Chỉ số dưới' },
  { label: '∫', latex: '\\int', tooltip: 'Tích phân' },
  { label: 'Σ', latex: '\\sum', tooltip: 'Tổng' },
  { label: '→', latex: '\\Rightarrow', tooltip: 'Suy ra' },
  { label: '∞', latex: '\\infty', tooltip: 'Vô cùng' },
  { label: '∈', latex: '\\in', tooltip: 'Thuộc' },
  { label: '≠', latex: '\\neq', tooltip: 'Khác' },
];

// --- Helper Component: EditableMathField ---
interface EditableMathFieldProps {
  value: string;
  onChange: (val: string) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  label?: React.ReactNode;
}

const EditableMathField: React.FC<EditableMathFieldProps> = ({
  value,
  onChange,
  multiline = false,
  className = "",
  placeholder = "Nhập nội dung...",
  label
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const safeValue = value || "";

  const insertSymbol = (latex: string) => {
    if (inputRef.current) {
      const input = inputRef.current;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const text = input.value;
      
      const newText = text.substring(0, start) + latex + text.substring(end);
      onChange(newText);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const bracePos = latex.indexOf('{}');
          if (bracePos !== -1) {
            inputRef.current.setSelectionRange(start + bracePos + 1, start + bracePos + 1);
          } else {
            inputRef.current.setSelectionRange(start + latex.length, start + latex.length);
          }
        }
      }, 0);
    }
  };

  if (isEditing) {
    const InputComponent = multiline ? 'textarea' : 'input';
    return (
      <div className={`flex flex-col w-full ${className}`}>
        <div className="flex flex-wrap gap-1 mb-1 p-1 bg-gray-100 rounded-t border border-gray-300 border-b-0 animate-in fade-in zoom-in-95 duration-100">
           {MATH_SYMBOLS.map((sym) => (
             <button
               key={sym.label}
               onMouseDown={(e) => { e.preventDefault(); insertSymbol(sym.latex); }}
               className="px-2 py-0.5 text-xs bg-white border border-gray-300 rounded hover:bg-bee-50 hover:border-bee-300 hover:text-bee-700 font-mono shadow-sm transition-colors"
               title={sym.tooltip}
             >
               {sym.label}
             </button>
           ))}
        </div>

        <div className="flex items-start w-full">
          {label && <div className="mr-2 mt-2 shrink-0 select-none text-gray-500 font-bold">{label}</div>}
          <InputComponent
            ref={inputRef as any}
            autoFocus
            value={safeValue}
            onChange={(e: any) => onChange(e.target.value)}
            onBlur={() => setIsEditing(false)}
            className={`w-full border border-bee-500 rounded-b rounded-tr p-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-bee-500 bg-white shadow-sm ${multiline ? 'min-h-[100px]' : ''}`}
            placeholder={placeholder}
            rows={multiline ? 4 : undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`flex items-start w-full cursor-text rounded border border-transparent hover:border-bee-200 hover:bg-white hover:shadow-sm p-2 transition-all group ${className} ${!safeValue ? 'bg-gray-50' : ''}`}
      title="Nhấn để chỉnh sửa"
    >
      {label && <div className="mr-2 shrink-0 select-none font-bold text-gray-600 group-hover:text-bee-600">{label}</div>}
      <div className="flex-1 min-w-0">
        {safeValue ? (
          <LatexPreview content={safeValue} className="text-gray-800" />
        ) : (
          <span className="text-gray-400 italic text-sm select-none">{placeholder}</span>
        )}
      </div>
    </div>
  );
};

// --- Main Component: QuestionCard ---

interface QuestionCardProps {
  question: Question;
  index: number;
  dragHandleProps?: any;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ question, index, dragHandleProps }) => {
  const { 
    updateQuestion, 
    deleteQuestion, 
    duplicateQuestion,
    isProcessing, 
    setProcessing, 
    setCroppingForQuestionId, 
    croppingForQuestionId,
    isSelectionMode,
    selectedQuestionIds,
    toggleQuestionSelection,
    solvingStatus
  } = useStore();
  const [isExpanded, setIsExpanded] = useState(true);
  
  const [showRegenPanel, setShowRegenPanel] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState('');
  const [regenDifficulty, setRegenDifficulty] = useState<string>(question.difficulty || 'Trung bình');
  const [regenTopic, setRegenTopic] = useState<string>(question.topic || 'Đại số');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCroppingThis = croppingForQuestionId === question.id;
  const isSelected = selectedQuestionIds.includes(question.id);
  const isSolving = solvingStatus[question.id] || false;

  const handleChange = (field: string, value: any) => {
    updateQuestion(question.id, { [field]: value } as any);
  };

  const handleRegenerate = async () => {
    setProcessing(true);
    try {
      const newQuestion = await regenerateQuestionData(question, {
        instruction: regenInstruction,
        difficulty: regenDifficulty,
        topic: regenTopic
      });
      // Ensure we are passing a full valid object
      if (newQuestion && newQuestion.id) {
        updateQuestion(question.id, newQuestion);
        setShowRegenPanel(false);
      } else {
        throw new Error("Dữ liệu không hợp lệ");
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi khi tạo lại số liệu. Vui lòng thử lại.");
    } finally {
      setProcessing(false);
    }
  };

  const toggleCropping = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCroppingThis) {
      setCroppingForQuestionId(null);
    } else {
      setCroppingForQuestionId(question.id);
      setIsExpanded(true); 
    }
  };

  const removeImage = () => {
    handleChange('figure_image', undefined);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        handleChange('figure_image', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSelectionMode) {
      e.stopPropagation();
      toggleQuestionSelection(question.id);
    }
  };

  const renderSpecificFields = () => {
    switch (question.type) {
      case 'multiple_choice': {
        const q = question as MultipleChoiceQuestion;
        // Defensive check: Ensure options exists and is array
        const options = (Array.isArray(q.options) && q.options.length > 0) ? q.options : ["", "", "", ""];
        
        return (
          <div className="mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-start space-x-2 rounded p-1 hover:bg-gray-50 transition-colors">
                  <div className="pt-2.5">
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correct_option === String.fromCharCode(65 + i)}
                      onChange={() => handleChange('correct_option', String.fromCharCode(65 + i))}
                      className="w-4 h-4 text-bee-500 focus:ring-bee-500 cursor-pointer"
                      title="Chọn làm đáp án đúng"
                      disabled={isSelectionMode}
                    />
                  </div>
                  <div className="flex-1">
                    <EditableMathField
                      label={`${String.fromCharCode(65 + i)}.`}
                      value={opt || ""} // Ensure never null
                      onChange={(val) => {
                        const newOpts = [...options];
                        newOpts[i] = val;
                        handleChange('options', newOpts);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'true_false_group': {
        const q = question as TrueFalseGroupQuestion;
        // Defensive check: Ensure sub_questions exists and is array
        const subs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
        
        if (subs.length === 0) {
            return <div className="text-gray-400 italic text-sm p-2">Chưa có ý nhỏ nào.</div>;
        }

        return (
          <div className="space-y-1 mt-2">
            {subs.map((sub, i) => (
              <div key={sub.id || i} className="flex items-start space-x-2 p-1 hover:bg-gray-50 rounded group">
                <div className="flex-1">
                  <EditableMathField
                    label={`${String.fromCharCode(97 + i)})`}
                    value={sub.content || ""}
                    onChange={(val) => {
                      const newSubs = [...subs];
                      newSubs[i] = { ...sub, content: val };
                      handleChange('sub_questions', newSubs);
                    }}
                  />
                </div>
                <button
                  onClick={() => {
                    const newSubs = [...subs];
                    newSubs[i] = { ...sub, is_correct: !sub.is_correct };
                    handleChange('sub_questions', newSubs);
                  }}
                  disabled={isSelectionMode}
                  className={`shrink-0 px-3 py-1.5 rounded text-xs font-bold mt-1.5 transition-colors border ${
                    sub.is_correct 
                      ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' 
                      : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                  }`}
                >
                  {sub.is_correct ? 'ĐÚNG' : 'SAI'}
                </button>
              </div>
            ))}
          </div>
        );
      }
      case 'short_answer': {
        const q = question as ShortAnswerQuestion;
        return (
          <div className="mt-3 bg-green-50/50 p-3 rounded-lg border border-green-100">
            <label className="block text-xs font-bold text-green-700 mb-1 uppercase tracking-wide">Đáp án đúng</label>
            <EditableMathField
              value={q.correct_answer || ''} 
              onChange={(val) => handleChange('correct_answer', val)}
              placeholder="Nhập đáp án..."
            />
          </div>
        );
      }
      case 'essay': {
        const q = question as EssayQuestion;
        return (
          <div className="mt-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Lời giải tham khảo</label>
            <EditableMathField
              multiline
              value={q.reference_solution || ''}
              onChange={(val) => handleChange('reference_solution', val)}
              placeholder="Nhập lời giải chi tiết..."
            />
          </div>
        );
      }
      default: return null;
    }
  };

  return (
    <div 
      className={`bg-white rounded-lg shadow-sm border transition-all group 
      ${isCroppingThis ? 'ring-2 ring-bee-500 border-bee-500' : ''} 
      ${isSelected ? 'ring-2 ring-bee-500 bg-bee-50' : 'border-gray-200 hover:shadow-md'}`}
      onClick={handleCardClick}
    >
      <div className={`flex items-center justify-between p-3 border-b border-gray-100 rounded-t-lg select-none ${isSelected ? 'bg-bee-100' : 'bg-gray-50/80'}`}>
        <div className="flex items-center space-x-3">
          {isSelectionMode ? (
            <div className="p-1 text-bee-600">
               {isSelected ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6 text-gray-400" />}
            </div>
          ) : (
            <div 
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 rounded text-gray-400 outline-none focus:ring-2 focus:ring-bee-300"
              title="Kéo để sắp xếp"
            >
               <GripVertical className="w-5 h-5" />
            </div>
          )}
          
          <span className="bg-bee-100 text-bee-900 text-xs font-bold px-2.5 py-1 rounded border border-bee-200">
            Câu {index + 1}
          </span>
          <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">
            {question.type === 'multiple_choice' && 'Trắc nghiệm'}
            {question.type === 'true_false_group' && 'Đúng/Sai'}
            {question.type === 'short_answer' && 'Điền khuyết'}
            {question.type === 'essay' && 'Tự luận'}
          </span>
          
          {isSolving && (
             <span className="flex items-center text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full animate-pulse border border-blue-100">
                <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                Đang tìm lời giải...
             </span>
          )}

        </div>
        
        <div className={`flex items-center space-x-1 opacity-60 group-hover:opacity-100 transition-opacity ${isSelectionMode ? 'invisible' : ''}`}>
          <button 
            onClick={toggleCropping} 
            className={`p-1.5 rounded transition-colors ${isCroppingThis ? 'bg-bee-500 text-white' : 'text-gray-500 hover:text-bee-600 hover:bg-bee-50'}`} 
            title={isCroppingThis ? "Đang chọn vùng ảnh..." : "Cắt hình từ đề bài"}
          >
            <Crop className="w-4 h-4" />
          </button>
          
          <button
             onClick={() => duplicateQuestion(question.id)}
             className="p-1.5 text-gray-500 hover:text-bee-600 rounded hover:bg-bee-50 transition-colors"
             title="Nhân bản câu hỏi"
          >
             <Copy className="w-4 h-4" />
          </button>

          <button 
            onClick={() => setShowRegenPanel(!showRegenPanel)} 
            className={`p-1.5 rounded transition-colors ${showRegenPanel ? 'bg-bee-100 text-bee-600' : 'text-gray-500 hover:text-bee-600 hover:bg-bee-50'}`}
            title="Đổi số liệu bằng AI"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => deleteQuestion(question.id)} className="p-1.5 text-gray-500 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title="Xóa">
            <Trash2 className="w-4 h-4" />
          </button>
          
        </div>
        <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className={`p-1.5 text-gray-500 hover:text-gray-800 rounded hover:bg-gray-200 ml-1 ${isSelectionMode ? 'visible' : ''}`}>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isCroppingThis && (
        <div className="bg-bee-100 text-bee-900 text-xs px-4 py-2 flex items-center animate-pulse">
          <Crop className="w-4 h-4 mr-2" />
          <span>Hãy kéo chuột trên hình ảnh đề bài (bên trái) để cắt hình cho câu hỏi này.</span>
        </div>
      )}

      {showRegenPanel && !isSelectionMode && (
        <div className="p-4 bg-bee-50 border-b border-bee-100 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center mb-3 text-bee-700 font-bold text-sm">
            <Sparkles className="w-4 h-4 mr-2" />
            Tạo câu hỏi mới (AI Support)
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
             <div>
               <label className="block text-xs font-medium text-gray-600 mb-1">Chủ đề (Nhập tự do)</label>
               <input
                 type="text"
                 value={regenTopic}
                 onChange={(e) => setRegenTopic(e.target.value)}
                 className="w-full text-sm border border-gray-300 rounded-md focus:ring-bee-500 focus:border-bee-500 py-1.5 px-2"
                 placeholder="VD: Hàm số mũ, Tích phân..."
               />
             </div>

             <div>
               <label className="block text-xs font-medium text-gray-600 mb-1">Độ khó (Tùy chỉnh)</label>
               <input
                 type="text"
                 value={regenDifficulty}
                 onChange={(e) => setRegenDifficulty(e.target.value)}
                 list="difficulty-options"
                 className="w-full text-sm border border-gray-300 rounded-md focus:ring-bee-500 focus:border-bee-500 py-1.5 px-2"
                 placeholder="VD: Vận dụng cao"
               />
               <datalist id="difficulty-options">
                 <option value="Nhận biết" />
                 <option value="Thông hiểu" />
                 <option value="Vận dụng" />
                 <option value="Vận dụng cao" />
               </datalist>
             </div>
          </div>

          <div className="mb-3">
             <label className="block text-xs font-medium text-gray-600 mb-1">Ngữ cảnh bổ sung / Yêu cầu cụ thể</label>
             <input
                type="text"
                placeholder="VD: Dạng bài toán thực tế, Kết quả là số nguyên..."
                className="w-full text-sm border-gray-300 rounded-md focus:ring-bee-500 focus:border-bee-500 py-1.5 px-3"
                value={regenInstruction}
                onChange={(e) => setRegenInstruction(e.target.value)}
             />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowRegenPanel(false)}
              className="px-3 py-1.5 text-xs text-gray-600 font-medium hover:bg-gray-200 rounded"
            >
              Hủy bỏ
            </button>
            <button
              onClick={handleRegenerate}
              disabled={isProcessing}
              className="bg-bee-500 text-white px-4 py-1.5 rounded text-xs font-bold hover:bg-bee-600 disabled:opacity-50 shadow-sm flex items-center"
            >
              {isProcessing ? <RefreshCw className="w-3 h-3 animate-spin mr-2"/> : <Sparkles className="w-3 h-3 mr-2"/>}
              {isProcessing ? 'Đang tạo...' : 'Tiến hành'}
            </button>
          </div>
        </div>
      )}

      {isExpanded && (
        <div className={`p-4 ${isSelectionMode ? 'pointer-events-none opacity-80' : ''}`}>
          <div className="mb-4">
             <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 ml-1">Nội dung câu hỏi</label>
             <EditableMathField
                multiline
                value={question.content}
                onChange={(val) => handleChange('content', val)}
                className="text-base"
             />
             
             {question.figure_image && (
               <div className="mt-3 relative group/image inline-block">
                 <img 
                   src={question.figure_image} 
                   alt="Hình minh họa" 
                   className="max-h-60 rounded border border-gray-200 shadow-sm"
                 />
                 <button 
                   onClick={removeImage}
                   className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover/image:opacity-100 transition-opacity hover:bg-red-600 pointer-events-auto"
                   title="Xóa ảnh"
                 >
                   <X className="w-3 h-3" />
                 </button>
               </div>
             )}
             
             {!question.figure_image && !isCroppingThis && (
               <div className="mt-2 flex items-center space-x-3">
                <button 
                  onClick={toggleCropping}
                  className="text-xs flex items-center text-bee-600 hover:text-bee-700 font-medium px-2 py-1 rounded hover:bg-bee-50 transition-colors pointer-events-auto"
                >
                  <Crop className="w-3 h-3 mr-1.5" />
                  Cắt từ đề
                </button>
                <div className="text-gray-300">|</div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs flex items-center text-gray-600 hover:text-gray-800 font-medium px-2 py-1 rounded hover:bg-gray-100 transition-colors pointer-events-auto"
                >
                  <UploadIcon className="w-3 h-3 mr-1.5" />
                  Tải ảnh lên
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleImageUpload} 
                />
               </div>
             )}
          </div>

          <div className="ml-1">
             {renderSpecificFields()}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 border-dashed relative">
            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 ml-1 flex items-center justify-between">
               Hướng dẫn giải
               {isSolving && (
                 <span className="text-blue-500 flex items-center animate-pulse normal-case font-normal text-xs">
                    <BrainCircuit className="w-3 h-3 mr-1" />
                    AI đang viết lời giải...
                 </span>
               )}
            </label>
            <div className={`bg-blue-50/30 rounded-lg p-1 border border-blue-100/50 transition-all duration-500 ${isSolving ? 'opacity-70 blur-[1px]' : 'opacity-100'}`}>
              <EditableMathField
                multiline
                value={question.solution_guide}
                onChange={(val) => handleChange('solution_guide', val)}
                placeholder={isSolving ? "Đang chờ AI..." : "Chưa có hướng dẫn giải. Nhấn để thêm..."}
                className="text-sm text-gray-700"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionCard;
