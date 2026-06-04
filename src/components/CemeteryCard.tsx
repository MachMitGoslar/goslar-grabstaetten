import { useNavigate } from 'react-router-dom';
import './CemeteryCard.css';

type CemeteryCardProps = {
    name: string;
    street: string;
    zipCode: string;
    city: string;
    image: string;
    href?: string;
    to?: string;
    onClick?: () => void;
};

export const CemeteryCard = ({
                                 name,
                                 street,
                                 zipCode,
                                 city,
                                 image,
                                 href,
                                 to,
                                 onClick,
                             }: CemeteryCardProps) => {
    const navigate = useNavigate();

    const handleClick = () => {
        onClick?.();

        if (to) {
            navigate(to);
            return;
        }

        if (href) {
            window.location.href = href;
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className="cemetery-card"
        >
            <div className="cemetery-card__content">
                <h3 className="cemetery-card__title">{name}</h3>

                <div className="cemetery-card__address">
                    <svg className="cemetery-card__pin" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 22s7-5.1 7-12a7 7 0 0 0-14 0c0 6.9 7 12 7 12Z" />
                        <circle cx="12" cy="10" r="2.6" />
                    </svg>
                    <span>
                        {street}
                        <br />
                        {zipCode} {city}
                    </span>
                </div>
            </div>

            <img
                src={image}
                alt={name}
                className="cemetery-card__image"
            />
        </button>
    );
};
