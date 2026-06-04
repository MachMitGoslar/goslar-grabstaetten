import { useNavigate } from 'react-router-dom';
import './ButtonTile.css';

type ButtonTileProps = {
    text: string;
    to?: string;
    onClick?: () => void;
};

export const ButtonTile = ({
                               text,
                               to,
                               onClick,
                           }: ButtonTileProps) => {
    const navigate = useNavigate();

    const handleClick = () => {
        onClick?.();

        if (to) {
            navigate(to);
        }
    };

    return (
        <button
            type="button"
            className="button-tile"
            onClick={handleClick}
        >
            {text}
        </button>
    );
};
