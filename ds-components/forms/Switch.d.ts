import React from 'react';
export interface SwitchProps {
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  label?: string;
}
export function Switch(props: SwitchProps): JSX.Element;
