import React from 'react';
/**
 * @startingPoint section="Data" subtitle="Image, title, subtitle, meta — e.g. a recipe card" viewport="700x260"
 */
export interface CardProps {
  imageSrc?: string;
  imageAlt?: string;
  title?: string;
  subtitle?: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export function Card(props: CardProps): JSX.Element;
