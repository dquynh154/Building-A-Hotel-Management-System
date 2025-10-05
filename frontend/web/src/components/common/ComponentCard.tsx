import React from "react";

interface ComponentCardProps {
  title: string;
  children: React.ReactNode;
  className?: string; // Additional custom classes for styling
  desc?: string; // Description text
  headerRight?: React.ReactNode;
  /** Tùy chỉnh class cho header nếu cần */
  headerClassName?: string;
  button?: React.ReactNode;
}

const ComponentCard: React.FC<ComponentCardProps> = ({
  title,
  children,
  className = "",
  desc = "",
  headerRight,
  headerClassName = "",
  button,
}) => {
  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}
    >
      {button && (
        <div className="flex flex-wrap items-center gap-2">
          {button}
        </div>
      )}
      {/* Card Header */}
      <div  className={`px-6 py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${headerClassName}`} >
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
          {title}
        </h3>
        {desc && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {desc}
          </p>
        )}

        {headerRight && (
          <div className="flex flex-wrap items-center gap-2">
            {headerRight}
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-800 sm:p-6">
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
};

export default ComponentCard;
