import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface ChatTextInputHandle {
  focus: () => void;
  blur: () => void;
  /** Current composer text, kept fresh without a parent re-render per keystroke. */
  getText: () => string;
  /** The live DOM input, for selection-aware operations such as formatting. */
  getInput: () => HTMLInputElement | null;
  setText: (text: string) => void;
  updateText: (updater: (previous: string) => string) => void;
}

interface ChatTextInputProps {
  /** Changing this (the chat id) reloads the composer with `initialValue`. */
  resetKey: string;
  initialValue: string;
  placeholder: string;
  commandMenuOpen: boolean;
  /** Slash only opens the command menu for bots that have commands. */
  enableSlash: boolean;
  onChangeText: (text: string) => void;
  onHasTextChange: (hasText: boolean) => void;
  onEnter: () => void;
  onSlash: () => void;
  onEscape: () => void;
}

/**
 * The chat composer's text field.
 *
 * The value lives here rather than in ChatScreen on purpose: ChatScreen renders
 * the whole conversation (header, banners, message rows, toolbars), so keeping
 * the typed text in its state meant every keystroke re-rendered all of it. With
 * the value local, a keystroke re-renders one input element; the rest of the
 * screen only hears about it when the field becomes empty or non-empty, which
 * is when the send/mic button has to swap.
 */
export const ChatTextInput = forwardRef<ChatTextInputHandle, ChatTextInputProps>(
  function ChatTextInput(props, ref) {
    const { resetKey, initialValue, placeholder, commandMenuOpen, enableSlash } = props;
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);
    const valueRef = useRef(value);
    valueRef.current = value;

    // Callbacks change on every ChatScreen render; reading them through a ref
    // keeps the handlers below stable and free of stale closures.
    const latest = useRef(props);
    latest.current = props;

    useEffect(() => {
      valueRef.current = initialValue;
      setValue(initialValue);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => inputRef.current?.focus(),
        blur: () => inputRef.current?.blur(),
        getText: () => valueRef.current,
        getInput: () => inputRef.current,
        setText: (text: string) => {
          valueRef.current = text;
          setValue(text);
          latest.current.onChangeText(text);
        },
        updateText: (updater: (previous: string) => string) => {
          const next = updater(valueRef.current);
          valueRef.current = next;
          setValue(next);
          latest.current.onChangeText(next);
        },
      }),
      [],
    );

    const applyValue = (next: string) => {
      const hadText = valueRef.current.trim().length > 0;
      valueRef.current = next;
      setValue(next);
      latest.current.onChangeText(next);
      const hasText = next.trim().length > 0;
      if (hasText !== hadText) latest.current.onHasTextChange(hasText);
    };

    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => applyValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            if (latest.current.commandMenuOpen) {
              event.preventDefault();
              return;
            }
            latest.current.onEnter();
            return;
          }
          if (
            event.key === '/' &&
            !valueRef.current &&
            !latest.current.commandMenuOpen &&
            latest.current.enableSlash
          ) {
            event.preventDefault();
            latest.current.onSlash();
            return;
          }
          if (event.key === 'Escape' && latest.current.commandMenuOpen) {
            event.preventDefault();
            latest.current.onEscape();
            return;
          }
          if (latest.current.commandMenuOpen && event.key === 'ArrowDown') {
            event.preventDefault();
          }
        }}
        placeholder={placeholder}
        data-inline-focus
        className="w-full bg-transparent text-sm text-[color:var(--nova-text-primary)] placeholder-[color:var(--nova-text-muted)] focus:outline-none py-1 min-w-0"
      />
    );
  },
);
