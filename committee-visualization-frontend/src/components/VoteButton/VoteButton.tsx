import React from 'react';

interface VoteButtonProps {
  onVote: () => void;
  disabled?: boolean;
  hasVoted?: boolean;
}

export const VoteButton: React.FC<VoteButtonProps> = ({
  onVote,
  disabled = false,
  hasVoted = false
}) => {
  if (hasVoted) {
    return (
      <div className="w-full bg-gray-800 text-gray-400 font-bold py-4 rounded-full text-center mb-6">
        ✓ Vote Submitted
      </div>
    );
  }

  return (
    <button
      onClick={onVote}
      disabled={disabled}
      className={`
        w-full font-bold py-4 rounded-full mb-6 transition-all
        ${disabled 
          ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
          : 'bg-green-500 text-black hover:bg-green-400 hover:scale-[1.02]'
        }
      `}
    >
      Vote
    </button>
  );
};