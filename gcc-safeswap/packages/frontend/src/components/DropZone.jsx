import React, { useRef } from 'react';

export default function DropZone({ onFile }) {
  const inputRef = useRef(null);

  const handleFiles = (files) => {
    if (files && files[0] && files[0].type === 'image/png') {
      onFile(files[0]);
    }
  };

  return (
    <div
      className="dropzone"
      onClick={() => inputRef.current && inputRef.current.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }}
    >
      <p>Select or drop PNG</p>
      <input
        type="file"
        accept="image/png"
        ref={inputRef}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
