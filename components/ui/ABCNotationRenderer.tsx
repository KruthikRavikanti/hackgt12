// components/ABCNotationRenderer.tsx
import React, { useEffect, useRef } from 'react';
import abcjs from 'abcjs';

interface ABCNotationRendererProps {
  abcNotation: string;
}

const ABCNotationRenderer: React.FC<ABCNotationRendererProps> = ({ abcNotation }) => {
  const abcContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (abcContainerRef.current) {
      abcjs.renderAbc(abcContainerRef.current, abcNotation);
    }
  }, [abcNotation]);

  return (
    <div
      ref={abcContainerRef}
      className="w-full overflow-x-auto overflow-y-hidden"
    ></div>
  );
};

export default ABCNotationRenderer;
