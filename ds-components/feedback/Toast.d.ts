import React from 'react';
export interface ToastProps {
  message: string;
  tone?: 'success' | 'danger' | 'info' | 'neutral';
  onClose?: () => void;
}
export function Toast(props: ToastProps): JSX.Element;
