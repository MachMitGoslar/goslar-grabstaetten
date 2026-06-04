import './GraveCard.css';

type GraveCardProps = {
    firstName: string;
    lastName: string;
    birthDate: string;
    deathDate: string;
    cemetery: string;
    onClick?: () => void;
};

export const GraveCard = ({
                              firstName,
                              lastName,
                              birthDate,
                              deathDate,
                              cemetery,
                              onClick,
                          }: GraveCardProps) => {
    return (
        <button
            type="button"
            onClick={onClick}
            className="grave-card"
        >
            <h3 className="grave-card__title">
                {lastName}, {firstName}
            </h3>

            <div className="grave-card__dates">
                <span className="grave-card__meta">
                    <CalendarIcon />
                    {birthDate}
                </span>

                <span className="grave-card__meta">
                    <CrossIcon />
                    {deathDate}
                </span>
            </div>

            <div className="grave-card__location">
                <LocationIcon />
                {cemetery}
            </div>
        </button>
    );
};

const CalendarIcon = () => (
    <span className="grave-card__icon-circle">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
          d="M7 2v3M17 2v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
      />
    </svg>
  </span>
);

const CrossIcon = () => (
    <span className="grave-card__icon-circle">
    <span className="grave-card__cross">†</span>
  </span>
);

const LocationIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
            d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z"
            stroke="#1C1B1F"
            strokeWidth="2"
        />
        <circle cx="12" cy="9" r="2.5" stroke="#1C1B1F" strokeWidth="2" />
    </svg>
);
