import React from 'react';
/**
 * @startingPoint section="Forms" subtitle="Labeled text input with error/helper states" viewport="700x140"
 */
export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  helper?: string;
  disabled?: boolean;
  type?: string;
}
export function Input(props: InputProps): JSX.Element;
