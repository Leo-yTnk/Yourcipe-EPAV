import React from 'react';
export interface TagProps {
  children?: React.ReactNode;
  onRemove?: () => void;
  selected?: boolean;
  onClick?: () => void;
}
export function Tag(props: TagProps): JSX.Element;
