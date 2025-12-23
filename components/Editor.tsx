
import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import QuestionCard from './QuestionCard';
import { generateWordContent } from '../services/exportService';
import { QuestionType, Question } from '../types';
import { 
  ArrowLeft, Plus, Crop, Check, X, FileText, FileCheck, 
  ChevronDown, ChevronLeft, ChevronRight, Undo2, Redo2, Cloud,
  CheckSquare, Copy, Trash2, MousePointer2, RotateCcw
} from 'lucide-react';
// Import from @hello-pangea/dnd (via ESM shim in index.html)
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

const Editor: React.FC = () => {
  const { 
    questions, 
    imageBase64, 
    pdfPages,
    setQuestions, 
    addQuestion, 
    croppingForQuestionId, 
    setCroppingForQuestionId, 
    updateQuestion,
    setImage,
    undo,
    redo,
    past,
    future,
    reorderQuestions,
    isSelectionMode,
    toggleSelectionMode,
    selectedQuestionIds,
    selectAllQuestions,
    clearSelection,
    deleteMultipleQuestions,
    clearAll
  } = useStore();
  
  // Ref for the image container and the image itself
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ref for the question list container to handle auto-scrolling
  const questionListContainerRef = useRef<HTMLDivElement>(null);
  const prevQuestionCountRef = useRef(questions.length);

  // State for cropping selection
  const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number, y: number } | null>(null);

  // State for Add Question Menu
  const [showAddMenu, setShowAddMenu] = useState(false);

  // State for PDF Pagination
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // Auto-save visual indicator
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl + Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Redo: Ctrl + Y or Ctrl + Shift + Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        redo();
      }

      // Select All: Ctrl + A (only in selection mode or focus on body)
      if (isSelectionMode && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllQuestions();
      }
      
      // Delete Selected: Delete key
      if (isSelectionMode && selectedQuestionIds.length > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
        // Only if not focused in an input
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (window.confirm(`Bạn có chắc muốn xóa ${selectedQuestionIds.length} câu hỏi đã chọn?`)) {
             deleteMultipleQuestions(selectedQuestionIds);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, isSelectionMode, selectAllQuestions, selectedQuestionIds, deleteMultipleQuestions]);

  // Update active image when page index changes
  useEffect(() => {
    if (pdfPages.length > 0) {
      setImage(pdfPages[currentPageIndex]);
    }
  }, [currentPageIndex, pdfPages, setImage]);

  // Clear selection when cropping mode changes
  useEffect(() => {
    setSelection(null);
    setIsDragging(false);
  }, [croppingForQuestionId]);

  // Auto-scroll to bottom when a new question is added
  useEffect(() => {
    if (questions.length > prevQuestionCountRef.current) {
      if (questionListContainerRef.current) {
        setTimeout(() => {
          questionListContainerRef.current?.scrollTo({
            top: questionListContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }, 100);
      }
    }
    prevQuestionCountRef.current = questions.length;
    
    // Update last saved time whenever questions change
    setLastSaved(new Date());
  }, [questions]);

  const onDragEnd = (result: DropResult) => {
    if (isSelectionMode) return; // Disable drag in selection mode

    if (!result.destination) {
      return;
    }

    if (result.destination.index === result.source.index) {
      return;
    }

    reorderQuestions(result.source.index, result.destination.index);
  };

  const handleExport = (includeAnswers: boolean) => {
    if (questions.length === 0) {
      alert("Không có câu hỏi nào để xuất.");
      return;
    }
    
    const content = generateWordContent(questions, includeAnswers);
    
    const dateStr = new Date().toISOString().slice(0,10);
    const fileName = includeAnswers 
      ? `BeeMath_DapAn_${dateStr}.doc` 
      : `BeeMath_DeThi_${dateStr}.doc`;

    const blob = new Blob(['\ufeff', content], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  const handleAddQuestion = (type: QuestionType) => {
    const common = {
      id: generateId(),
      content: 'Nội dung câu hỏi mới...',
      solution_guide: '',
      topic: 'Chủ đề chung',
      difficulty: 'Trung bình', // Default as string
      type: type
    };

    let newQuestion: Question;

    if (type === 'multiple_choice') {
      newQuestion = {
        ...common,
        type: 'multiple_choice',
        options: ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'],
        correct_option: 'A'
      };
    } else if (type === 'true_false_group') {
      newQuestion = {
        ...common,
        type: 'true_false_group',
        sub_questions: [
          { id: generateId(), content: 'Ý thứ nhất', is_correct: true },
          { id: generateId(), content: 'Ý thứ hai', is_correct: false },
          { id: generateId(), content: 'Ý thứ ba', is_correct: false },
          { id: generateId(), content: 'Ý thứ tư', is_correct: true },
        ]
      };
    } else if (type === 'short_answer') {
      newQuestion = {
        ...common,
        type: 'short_answer',
        correct_answer: ''
      };
    } else {
      // Default to essay if not matched or explicitly 'essay'
      newQuestion = {
        ...common,
        type: 'essay',
        reference_solution: ''
      };
    }

    addQuestion(newQuestion);
    setShowAddMenu(false);
  };

  const handleDeleteSelected = () => {
    if (selectedQuestionIds.length === 0) return;
    if (window.confirm(`Bạn có chắc muốn xóa ${selectedQuestionIds.length} câu hỏi đã chọn?`)) {
       deleteMultipleQuestions(selectedQuestionIds);
    }
  };
  
  const handleClearAll = () => {
    if (window.confirm("Bạn có chắc muốn xóa toàn bộ câu hỏi và bắt đầu lại? Dữ liệu chưa xuất sẽ bị mất.")) {
      clearAll();
      localStorage.removeItem('beemath_draft_questions');
    }
  };

  // --- Cropping Logic ---

  const getRelativeCoordinates = (e: React.MouseEvent) => {
    if (!imageRef.current) return { x: 0, y: 0 };
    const rect = imageRef.current.getBoundingClientRect();
    
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    x = Math.max(0, Math.min(x, rect.width));
    y = Math.max(0, Math.min(y, rect.height));

    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!croppingForQuestionId || !imageRef.current) return;
    e.preventDefault();
    setIsDragging(true);
    const coords = getRelativeCoordinates(e);
    setStartPos(coords);
    setSelection({ x: coords.x, y: coords.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !startPos || !croppingForQuestionId) return;
    const current = getRelativeCoordinates(e);
    
    const x = Math.min(current.x, startPos.x);
    const y = Math.min(current.y, startPos.y);
    const w = Math.abs(current.x - startPos.x);
    const h = Math.abs(current.y - startPos.y);

    setSelection({ x, y, w, h });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const confirmCrop = () => {
    if (!selection || !imageRef.current || !croppingForQuestionId) return;

    const img = imageRef.current;
    
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const cropX = selection.x * scaleX;
    const cropY = selection.y * scaleY;
    const cropW = selection.w * scaleX;
    const cropH = selection.h * scaleY;

    if (cropW <= 0 || cropH <= 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const base64Crop = canvas.toDataURL('image/png');
      
      updateQuestion(croppingForQuestionId, { figure_image: base64Crop });
      setCroppingForQuestionId(null);
    }
  };

  const cancelCrop = () => {
    setCroppingForQuestionId(null);
  };

  // --- Pagination Logic ---
  const handlePrevPage = () => {
    if (currentPageIndex > 0) setCurrentPageIndex(prev => prev - 1);
  };
  
  const handleNextPage = () => {
    if (currentPageIndex < pdfPages.length - 1) setCurrentPageIndex(prev => prev + 1);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4 shrink-0 z-10 shadow-sm">
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleClearAll}
            className="p-2 hover:bg-red-50 hover:text-red-600 rounded-full text-gray-600 transition-colors"
            title="Làm mới / Quay lại trang chủ"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex flex-col">
            <h1 className="font-bold text-gray-800 text-base leading-tight flex items-center">
              <span className="text-bee-500 mr-2">BeeMath</span> Editor
            </h1>
            <div className="flex items-center text-[10px] text-gray-400 font-medium">
               {lastSaved && (
                 <span className="flex items-center text-green-600">
                   <Cloud className="w-3 h-3 mr-1" />
                   Đã lưu nháp {lastSaved.toLocaleTimeString()}
                 </span>
               )}
            </div>
          </div>

          <div className="h-6 w-px bg-gray-200 mx-2"></div>

          {/* Undo / Redo Buttons */}
          <div className="flex items-center space-x-1">
             <button 
               onClick={undo}
               disabled={past.length === 0}
               className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent text-gray-600 transition-colors"
               title="Hoàn tác (Ctrl+Z)"
             >
               <Undo2 className="w-5 h-5" />
             </button>
             <button 
               onClick={redo}
               disabled={future.length === 0}
               className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent text-gray-600 transition-colors"
               title="Làm lại (Ctrl+Y)"
             >
               <Redo2 className="w-5 h-5" />
             </button>
          </div>
          
          {/* Select Mode Toggle */}
          <button
            onClick={toggleSelectionMode}
            className={`flex items-center space-x-1 px-2 py-1.5 rounded transition-colors ml-2 ${isSelectionMode ? 'bg-bee-100 text-bee-700 font-bold border border-bee-200' : 'text-gray-600 hover:bg-gray-100'}`}
            title="Chế độ chọn nhiều"
          >
             {isSelectionMode ? <CheckSquare className="w-5 h-5" /> : <MousePointer2 className="w-5 h-5" />}
          </button>
          
          {/* Reset All Button */}
          <button
            onClick={handleClearAll}
            className="ml-2 p-1.5 text-red-500 hover:bg-red-50 rounded"
            title="Xóa tất cả & Bắt đầu lại"
          >
             <RotateCcw className="w-5 h-5" />
          </button>

        </div>
        
        {/* Helper Message during cropping */}
        {croppingForQuestionId && (
          <div className="absolute left-1/2 transform -translate-x-1/2 bg-bee-500 text-white px-4 py-1.5 rounded-full text-sm shadow-lg font-medium flex items-center animate-bounce">
            <Crop className="w-4 h-4 mr-2" />
            Kéo chuột chọn vùng ảnh cần cắt
          </div>
        )}

        <div className="flex items-center space-x-2">
           <span className="mr-2 text-xs font-normal bg-gray-100 px-2.5 py-1 rounded-full text-gray-500 border border-gray-200">
              {questions.length} câu hỏi
            </span>

          {/* Add Question Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setShowAddMenu(!showAddMenu)}
              disabled={isSelectionMode}
              className={`flex items-center px-3 py-1.5 text-sm font-medium border rounded-md shadow-sm mr-2 ${isSelectionMode ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'}`}
            >
              <Plus className="w-4 h-4 mr-2" />
              Thêm câu
              <ChevronDown className="w-3 h-3 ml-2 text-gray-400" />
            </button>
            
            {showAddMenu && !isSelectionMode && (
              <div className="absolute top-full right-2 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <button 
                  onClick={() => handleAddQuestion('multiple_choice')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-bee-50 hover:text-bee-700 flex items-center"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                  Trắc nghiệm
                </button>
                <button 
                  onClick={() => handleAddQuestion('true_false_group')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-bee-50 hover:text-bee-700 flex items-center"
                >
                  <span className="w-2 h-2 rounded-full bg-purple-500 mr-2"></span>
                  Đúng / Sai
                </button>
                <button 
                  onClick={() => handleAddQuestion('short_answer')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-bee-50 hover:text-bee-700 flex items-center"
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  Điền khuyết
                </button>
                <button 
                  onClick={() => handleAddQuestion('essay')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-bee-50 hover:text-bee-700 flex items-center"
                >
                  <span className="w-2 h-2 rounded-full bg-orange-500 mr-2"></span>
                  Tự luận
                </button>
              </div>
            )}
          </div>
          
          <div className="h-6 w-px bg-gray-300 mx-1"></div>

          {/* Export Buttons */}
          <button 
            onClick={() => handleExport(false)}
            className="flex items-center px-3 py-1.5 text-sm font-bold text-bee-700 bg-bee-100 border border-bee-200 rounded-md hover:bg-bee-200 shadow-sm transition-colors"
            title="Xuất đề thi (không đáp án)"
          >
            <FileText className="w-4 h-4 mr-2" />
            Xuất Đề
          </button>

          <button 
            onClick={() => handleExport(true)}
            className="flex items-center px-3 py-1.5 text-sm font-bold text-white bg-bee-500 border border-bee-600 rounded-md hover:bg-bee-600 shadow-sm transition-colors"
            title="Xuất đáp án và lời giải"
          >
            <FileCheck className="w-4 h-4 mr-2" />
            Xuất Đáp Án
          </button>
        </div>
      </header>

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: Image Viewer with Cropper */}
        <div className="w-1/2 bg-gray-800 relative flex flex-col border-r border-gray-700">
          
          {/* Controls Bar for PDF pages */}
          {pdfPages.length > 1 && (
            <div className="bg-gray-700 text-white p-2 flex items-center justify-between z-20 shadow-md">
               <button 
                 onClick={handlePrevPage}
                 disabled={currentPageIndex === 0}
                 className="p-1 hover:bg-gray-600 rounded disabled:opacity-30 disabled:hover:bg-transparent"
               >
                 <ChevronLeft className="w-5 h-5" />
               </button>
               <span className="text-sm font-medium">
                 Trang {currentPageIndex + 1} / {pdfPages.length}
               </span>
               <button 
                 onClick={handleNextPage}
                 disabled={currentPageIndex === pdfPages.length - 1}
                 className="p-1 hover:bg-gray-600 rounded disabled:opacity-30 disabled:hover:bg-transparent"
               >
                 <ChevronRight className="w-5 h-5" />
               </button>
            </div>
          )}

          <div className="absolute top-4 left-4 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10 select-none mt-10 lg:mt-0">
            Đề bài gốc
          </div>
          
          {imageBase64 ? (
            <div 
              ref={containerRef}
              className="overflow-auto w-full h-full relative"
            >
              <div className="inline-block min-w-full min-h-full p-8 flex justify-center items-start">
                <div 
                  className={`relative inline-block ${croppingForQuestionId ? 'cursor-crosshair' : ''}`}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <img 
                    ref={imageRef}
                    src={imageBase64} 
                    alt="Original Exam" 
                    className="max-w-none shadow-2xl block select-none" 
                    draggable={false}
                  />
                  
                  {/* Selection Overlay */}
                  {croppingForQuestionId && selection && selection.w > 0 && (
                    <div 
                      style={{
                        position: 'absolute',
                        left: selection.x,
                        top: selection.y,
                        width: selection.w,
                        height: selection.h,
                        border: '2px dashed #f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.2)',
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                        zIndex: 20
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Action Buttons */}
                      <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 flex space-x-2 pointer-events-auto">
                        <button 
                          onClick={(e) => { e.stopPropagation(); confirmCrop(); }}
                          className="bg-green-500 hover:bg-green-600 text-white p-1 rounded shadow"
                          title="Xác nhận cắt"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <Check className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); cancelCrop(); }}
                          className="bg-red-500 hover:bg-red-600 text-white p-1 rounded shadow"
                          title="Hủy"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">Không có ảnh</div>
          )}
        </div>

        {/* Right Panel: Editor List with Drag & Drop */}
        <div className="w-1/2 bg-gray-50 flex flex-col relative">
          <div 
            ref={questionListContainerRef}
            className={`flex-1 overflow-y-auto p-6 scroll-smooth ${isSelectionMode ? 'pb-24' : ''}`}
          >
            <div className="max-w-3xl mx-auto pb-20">
              {questions.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  Chưa có câu hỏi nào. Tải ảnh hoặc PDF lên để AI trích xuất hoặc thêm thủ công.
                </div>
              ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="questions-list" isDropDisabled={isSelectionMode}>
                    {(provided) => (
                      <div 
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="space-y-0" // Spacing managed by individual items via wrapper
                      >
                        {questions.map((q, index) => (
                          <Draggable key={q.id} draggableId={q.id} index={index} isDragDisabled={isSelectionMode}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`mb-4 transition-transform ${snapshot.isDragging ? 'z-50' : ''}`}
                                style={{ ...provided.draggableProps.style }}
                              >
                                <QuestionCard 
                                  question={q} 
                                  index={index} 
                                  dragHandleProps={provided.dragHandleProps}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </div>
          </div>
          
          {/* Bulk Action Bar - Sticky Bottom */}
          {isSelectionMode && (
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-20 flex items-center justify-between animate-in slide-in-from-bottom-2">
               <div className="flex items-center space-x-4">
                 <span className="font-bold text-gray-700">Đã chọn: <span className="text-bee-600 text-lg">{selectedQuestionIds.length}</span> câu</span>
                 <button 
                   onClick={selectAllQuestions}
                   className="text-sm text-blue-600 hover:text-blue-800 underline"
                 >
                   Chọn tất cả
                 </button>
                 {selectedQuestionIds.length > 0 && (
                    <button 
                      onClick={clearSelection}
                      className="text-sm text-gray-500 hover:text-gray-700 underline"
                    >
                      Bỏ chọn
                    </button>
                 )}
               </div>
               
               <div className="flex space-x-2">
                 <button 
                   onClick={handleDeleteSelected}
                   disabled={selectedQuestionIds.length === 0}
                   className="flex items-center bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                 >
                   <Trash2 className="w-4 h-4 mr-2" />
                   Xóa ({selectedQuestionIds.length})
                 </button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Editor;
