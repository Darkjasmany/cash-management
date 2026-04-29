type Props = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

const UserModal = ({ isOpen, title, onClose, children }: Props) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-xl p-6
                   w-full max-w-md shadow-xl mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-medium text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition text-xl">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default UserModal;
