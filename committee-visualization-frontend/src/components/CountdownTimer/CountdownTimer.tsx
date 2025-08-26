import React, { useState, useEffect } from 'react';

interface CountdownTimerProps {
  endTime: Date;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ endTime }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = endTime.getTime() - new Date().getTime();
      
      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);
        
        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [endTime]);

  return (
    <div className="flex items-center justify-center space-x-6 py-4 mb-4">
      <div className="text-center">
        <div className="text-3xl font-bold text-white">
          {String(timeLeft.days).padStart(2, '0')}
        </div>
        <div className="text-xs text-gray-500 uppercase">days</div>
      </div>
      
      <div className="text-center">
        <div className="text-3xl font-bold text-white">
          {String(timeLeft.hours).padStart(2, '0')}
        </div>
        <div className="text-xs text-gray-500 uppercase">hrs</div>
      </div>
      
      <div className="text-center">
        <div className="text-3xl font-bold text-white">
          {String(timeLeft.minutes).padStart(2, '0')}
        </div>
        <div className="text-xs text-gray-500 uppercase">min</div>
      </div>
      
      <div className="text-center">
        <div className="text-3xl font-bold text-white">
          {String(timeLeft.seconds).padStart(2, '0')}
        </div>
        <div className="text-xs text-gray-500 uppercase">sec</div>
      </div>
    </div>
  );
};