import React from 'react';
export interface IconButtonProps {
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
}
export function IconButton(props: IconButtonProps): JSX.Element;
