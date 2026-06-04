import './SearchBar.css';

interface SearchBarProps {
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
    onFilterClick?: () => void;
}

const SearchBar = ({
                       placeholder = "Suchen ...",
                       value = "",
                       onChange,
                       onFilterClick,
                   }: SearchBarProps) => {
    return (
        <div className="search-row">
            <div className="search-box">
                <input
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange?.(e.target.value)}
                />
            </div>

            <button
                type="button"
                className="filter-button"
                onClick={onFilterClick}
                aria-label="Filter"
            >
                <FilterIcon />
            </button>
        </div>
    );
};

const FilterIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path
            d="M4 5h16l-6.4 7.2V19l-3.2 1.6v-8.4L4 5Z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="2.6"
        />
    </svg>
);

export default SearchBar;
