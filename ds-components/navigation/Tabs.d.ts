import React from 'react';
/**
 * @startingPoint section="Navigation" subtitle="Underlined tab bar" viewport="700x80"
 */
export interface TabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}
export function Tabs(props: TabsProps): JSX.Element;
