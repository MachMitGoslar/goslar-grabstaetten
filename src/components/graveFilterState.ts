export type GraveFilters = {
    birthDate: string;
    deathDate: string;
    cemetery: string;
    searchFirstName: boolean;
    searchLastName: boolean;
    searchBirthName: boolean;
};

export const defaultGraveFilters: GraveFilters = {
    birthDate: '',
    deathDate: '',
    cemetery: '',
    searchFirstName: true,
    searchLastName: true,
    searchBirthName: true,
};
