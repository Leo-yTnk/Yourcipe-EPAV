import React from 'react';
export interface DialogProps {
  open: boolean;
  title?: string;
  children?: React.ReactNode;
  onClose?: () => void;
  actions?: React.ReactNode;
}
export function Dialog(props: DialogProps): JSX.Element | null;
