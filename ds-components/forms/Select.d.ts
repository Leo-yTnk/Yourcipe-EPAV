import React from 'react';
export interface SelectProps {
  label?: string;
  options?: string[];
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
}
export function Select(props: SelectProps): JSX.Element;
