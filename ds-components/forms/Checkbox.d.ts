import React from 'react';
export interface CheckboxProps {
  label?: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}
export function Checkbox(props: CheckboxProps): JSX.Element;
