import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

/**
 * Reusable Searchable Dropdown Component
 *
 * Supports:
 * - Live typeahead filtering across label, secondary, and value/code
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape)
 * - Grouped options with category headers
 * - Disabled option indicator (e.g. non-posting summary groups)
 * - Clear button
 * - Click outside detection
 */
export default function SearchableDropdown({
  options = [],
  value = null,
  onChange,
  placeholder = 'Select option...',
  searchPlaceholder = 'Type to search...',
  disabled = false,
  allowClear = true,
  className = '',
  dropdownClassName = '',
  emptyMessage = 'No matching options found',
  renderOption = null,
  allowCustom = false,
  customOptionPrefix = 'Use custom:'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on searchTerm
  const filteredOptions = useMemo(() => {
    let result = options;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = options.filter(opt => {
        const matchLabel = opt.label && opt.label.toLowerCase().includes(term);
        const matchValue = opt.value && String(opt.value).toLowerCase().includes(term);
        const matchSecondary = opt.secondary && opt.secondary.toLowerCase().includes(term);
        const matchGroup = opt.group && opt.group.toLowerCase().includes(term);
        return matchLabel || matchValue || matchSecondary || matchGroup;
      });
    }

    if (allowCustom && searchTerm.trim()) {
      const trimmed = searchTerm.trim();
      const exactMatch = options.some(opt => opt.label && opt.label.toLowerCase() === trimmed.toLowerCase());
      if (!exactMatch) {
        result = [
          ...result,
          {
            value: `custom:${trimmed}`,
            label: trimmed,
            secondary: `${customOptionPrefix} "${trimmed}"`,
            badge: 'Custom',
            isCustom: true
          }
        ];
      }
    }
    return result;
  }, [options, searchTerm, allowCustom, customOptionPrefix]);

  // Current selected option
  const selectedOption = useMemo(() => {
    if (!value) return null;
    const found = options.find(opt => String(opt.value) === String(value));
    if (found) return found;
    if (allowCustom) {
      const cleanVal = String(value).startsWith('custom:') ? String(value).slice(7) : String(value);
      return {
        value,
        label: cleanVal,
        badge: 'Custom'
      };
    }
    return null;
  }, [options, value, allowCustom]);

  // Focus input on dropdown open
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(-1);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        let next = prev + 1;
        while (next < filteredOptions.length && filteredOptions[next].disabled) {
          next++;
        }
        return next < filteredOptions.length ? next : prev;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        let next = prev - 1;
        while (next >= 0 && filteredOptions[next].disabled) {
          next--;
        }
        return next >= 0 ? next : 0;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        const item = filteredOptions[highlightedIndex];
        if (!item.disabled) {
          handleSelect(item);
        }
      }
    }
  };

  const handleSelect = (option) => {
    if (option.disabled) return;
    if (onChange) {
      const cleanVal = option.isCustom && String(option.value).startsWith('custom:')
        ? String(option.value).slice(7)
        : option.value;
      onChange(cleanVal, option);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (disabled) return;
    if (onChange) {
      onChange(null, null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-left text-sm ${isOpen ? 'z-[90]' : 'z-10'} ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full min-h-[38px] flex items-center justify-between px-3 py-1.5 bg-slate-900 border rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-slate-750 text-slate-400'
            : isOpen
            ? 'border-emerald-500 ring-1 ring-emerald-500 text-white shadow-md'
            : 'border-slate-750 hover:border-slate-650 text-slate-200'
        }`}
      >
        <span className="truncate flex-1 text-left min-w-0 pr-2">
          {selectedOption ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-white truncate text-xs">{selectedOption.label}</span>
              {selectedOption.badge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                  {selectedOption.badge}
                </span>
              )}
            </span>
          ) : (
            <span className="text-slate-500 text-xs">{placeholder}</span>
          )}
        </span>

        <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
          {allowClear && selectedOption && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="p-1 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-400' : ''}`} />
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 z-[100] mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-72 w-full min-w-[320px] ${dropdownClassName}`}
        >
          {/* Search Box */}
          <div className="p-2 border-b border-slate-800 bg-slate-950/80 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-slate-400 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div ref={listRef} className="overflow-y-auto divide-y divide-slate-800/40 p-1 flex-1">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                const isHighlighted = idx === highlightedIndex;
                const prevOpt = idx > 0 ? filteredOptions[idx - 1] : null;
                const showGroupHeader = Boolean(opt.group && (!prevOpt || prevOpt.group !== opt.group));

                return (
                  <React.Fragment key={opt.value ?? idx}>
                    {showGroupHeader && (
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-950/90 rounded sticky top-0 my-0.5 border-y border-slate-800/80">
                        {opt.group}
                      </div>
                    )}
                    {renderOption ? (
                      <div
                        onClick={() => handleSelect(opt)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                      >
                        {renderOption(opt, { isSelected, isHighlighted })}
                      </div>
                    ) : (
                      <div
                        onClick={() => handleSelect(opt)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`px-3 py-2 rounded-md cursor-pointer transition-colors flex items-center justify-between text-xs ${
                          opt.disabled
                            ? 'opacity-40 cursor-not-allowed bg-transparent'
                            : isSelected
                            ? 'bg-emerald-950/40 text-emerald-300 font-medium'
                            : isHighlighted
                        ? 'bg-slate-800/80 text-white'
                        : 'text-slate-300 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{opt.label}</span>
                        {opt.badge && (
                          <span className="text-[10px] px-1 py-0.5 rounded font-mono uppercase bg-slate-800 text-slate-400 border border-slate-700/80">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {(opt.secondary || opt.disabledReason) && (
                        <div className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
                          {opt.secondary && <span>{opt.secondary}</span>}
                          {opt.disabledReason && (
                            <span className="text-amber-500/80 italic font-mono text-[10px]">
                              [{opt.disabledReason}]
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
