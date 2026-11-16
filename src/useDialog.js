import { useEffect, useRef } from 'react';

export default function useDialog(onClose, busy = false) {
  const dialog = useRef(null), timer = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
    return () => clearTimeout(timer.current);
  }, []);
  function close() {
    if (busy || timer.current) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { onClose(); return; }
    dialog.current.classList.add('is-closing');
    timer.current = setTimeout(onClose, 160);
  }
  return { dialog, close };
}
