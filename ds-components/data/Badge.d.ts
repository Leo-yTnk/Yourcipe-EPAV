import React from 'react';
export interface BadgeProps {
  children?: React.ReactNode;
  tone?: 'neutral' | 'brand' | 'success' | 'danger' | 'info';
}
export function Badge(props: BadgeProps): JSX.Element;
