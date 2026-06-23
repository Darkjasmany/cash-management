type PaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
};

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [];
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, "...", total);
  } else if (current >= total - 3) {
    pages.push(1, "...", total - 4, total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, "...", current - 1, current, current + 1, "...", total);
  }
  return pages;
}

const Pagination = ({ currentPage, totalPages, totalItems, onPageChange }: PaginationProps) => {
  if (totalPages <= 1) return null;

  const from = (currentPage - 1) * 10 + 1;
  const to = Math.min(currentPage * 10, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-slate-800/60 bg-slate-900/40">
      <p className="text-xs text-slate-500">
        Mostrando <span className="font-medium text-slate-400">{from}</span>-
        <span className="font-medium text-slate-400">{to}</span> de{" "}
        <span className="font-medium text-slate-400">{totalItems}</span> resultados
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-400 hover:bg-slate-700/60 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800/40 disabled:hover:text-slate-400 transition-all"
        >
          Anterior
        </button>

        <div className="flex items-center gap-0.5 mx-1">
          {getPageNumbers(currentPage, totalPages).map((item, idx) =>
            item === "..." ? (
              <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-xs text-slate-600 select-none">
                ...
              </span>
            ) : (
              <button
                key={item}
                onClick={() => onPageChange(item)}
                className={`min-w-[32px] h-8 text-xs font-medium rounded-md border transition-all ${
                  item === currentPage
                    ? "bg-sky-600 border-sky-500 text-white shadow-md shadow-sky-600/20"
                    : "bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-700/60 hover:text-white"
                }`}
              >
                {item}
              </button>
            )
          )}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-400 hover:bg-slate-700/60 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800/40 disabled:hover:text-slate-400 transition-all"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
};

export default Pagination;
