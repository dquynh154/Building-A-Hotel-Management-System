"use client";
import React, { useRef, useEffect, useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean; // New prop to control close button visibility
  isFullscreen?: boolean; // Default to false for backwards compatibility
  variant?: "center" | "right";
  hasBackdrop?: boolean;
  backdropClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true, // Default to true for backwards compatibility
  isFullscreen = false,
  variant = "center",
  hasBackdrop = true,
  backdropClassName = "bg-gray-400/50 backdrop-blur-[32px]",
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => setEntered(true));
    } else {
      document.body.style.overflow = "unset";
      setEntered(false);
    }

    return () => {
      document.body.style.overflow = "unset";
      setEntered(false);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // nếu không có backdrop -> cho pass-through click ở ngoài panel
  const wrapperClass =
    variant === "right"
      ? "fixed inset-0 z-99999 flex justify-end items-stretch"
      : "fixed inset-0 z-99999 flex items-center justify-center overflow-y-auto";

  const backdrop =
    hasBackdrop && !isFullscreen ? (
      <div
        className={`fixed inset-0 h-full w-full ${backdropClassName}`}  // 👈 dùng class truyền vào
        onClick={onClose}
      />
    ) : null;

  const basePanel = "relative bg-white dark:bg-gray-900";
  const contentClasses = isFullscreen
    ? "w-full h-full"
    : variant === "right"
      ? [
        basePanel,
        "h-full w-full max-w-[420px] sm:max-w-[1120px] shadow-xl",
        "transition-transform duration-300 ease-out",
        entered ? "translate-x-0" : "translate-x-full", 
        "rounded-none sm:rounded-l-2xl",
      ].join(" ")
      : [basePanel, "relative w-full rounded-3xl"].join(" ");

  return (
    <div className={wrapperClass}>
      {backdrop}
      <div
        className={`${contentClasses} ${className || ""} ${!hasBackdrop ? "pointer-events-auto" : ""
          }`}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            className={`absolute z-999 flex items-center justify-center
              right-3 top-3 h-9.5 w-9.5 rounded-full bg-gray-100 text-gray-400
              transition-colors hover:bg-gray-200 hover:text-gray-700
              dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white
              sm:right-6 sm:top-6 sm:h-11 sm:w-11`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 6.04289 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
                fill="currentColor"
              />
            </svg>
          </button>
        )}
        <div>{children}</div>
      </div>
    </div>
  );

};
