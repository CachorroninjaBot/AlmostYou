import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  meta?: string;
}

interface SelectMenuProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  align?: 'start' | 'end';
  variant?: 'compact' | 'field';
  className?: string;
}

const TYPEAHEAD_RESET_MS = 600;

export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  disabled = false,
  icon,
  align = 'start',
  variant = 'compact',
  className,
}: SelectMenuProps) {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listId = `${generatedId}-listbox`;

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeaheadRef = useRef({ buffer: '', at: 0 });

  const selectedIndex = options.findIndex((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(selectedIndex, 0));

  const selected = options[selectedIndex] ?? options[0];

  const close = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const openMenu = () => {
    if (disabled || options.length === 0) return;
    setActiveIndex(Math.max(selectedIndex, 0));
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    close(true);
  };

  useEffect(() => {
    if (!open) return;

    listRef.current?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onWindowBlur = () => setOpen(false);

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.querySelector<HTMLElement>(`[data-index='${activeIndex}']`);
    option?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const count = options.length;
    if (count === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % count);
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + count) % count);
        return;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        return;
      case 'End':
        event.preventDefault();
        setActiveIndex(count - 1);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(activeIndex);
        return;
      case 'Escape':
        event.preventDefault();
        close(true);
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        break;
    }

    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;

    const now = Date.now();
    const state = typeaheadRef.current;
    state.buffer = now - state.at > TYPEAHEAD_RESET_MS ? event.key : state.buffer + event.key;
    state.at = now;

    const query = state.buffer.toLowerCase();
    const start = query.length > 1 ? activeIndex : activeIndex + 1;
    for (let offset = 0; offset < count; offset += 1) {
      const index = (start + offset) % count;
      if (options[index]?.label.toLowerCase().startsWith(query)) {
        event.preventDefault();
        setActiveIndex(index);
        return;
      }
    }
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu();
    }
  };

  return (
    <div
      ref={rootRef}
      className={clsx(
        'select-menu',
        `select-menu--${variant}`,
        align === 'end' && 'select-menu--align-end',
        open && 'select-menu--open',
        disabled && 'select-menu--disabled',
        className,
      )}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="select-menu__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        {icon ? <span className="select-menu__icon">{icon}</span> : null}
        <span className="select-menu__label">{selected?.label ?? ariaLabel}</span>
        <svg className="select-menu__chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3.5 6 8 10.5 12.5 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          className="select-menu__panel"
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-option-${activeIndex}`}
          onKeyDown={handleListKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li
                key={option.value}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                data-index={index}
                data-active={index === activeIndex}
                className="select-menu__option"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
              >
                <span className="select-menu__option-label">{option.label}</span>
                {option.meta ? <span className="select-menu__meta">{option.meta}</span> : null}
                <svg className="select-menu__check" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="m3 8.5 3.2 3L13 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
