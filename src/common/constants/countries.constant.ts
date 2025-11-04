// src/common/constants/countries.constant.ts

export interface CountryData {
  name: string;
  code: string;
  emoji: string;
  currencyCode: string;
  currencySymbol: string;
  phoneCode: string;
}

export const SUPPORTED_COUNTRIES: { [key: string]: CountryData } = {
  CA: {
    name: 'Canada',
    code: 'CA',
    emoji: '🇨🇦',
    currencyCode: 'CAD',
    currencySymbol: '$',
    phoneCode: '+1',
  },
  NG: {
    name: 'Nigeria',
    code: 'NG',
    emoji: '🇳🇬',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    phoneCode: '+234',
  },
};

// Helper function to get all countries as an array
export const getAllCountries = (): CountryData[] => {
  return Object.values(SUPPORTED_COUNTRIES);
};

// Helper function to get country by code
export const getCountryByCode = (code: string): CountryData | undefined => {
  return SUPPORTED_COUNTRIES[code.toUpperCase()];
};

// Helper function to get countries by currency code
export const getCountriesByCurrency = (currencyCode: string): CountryData[] => {
  return Object.values(SUPPORTED_COUNTRIES).filter(
    (country) => country.currencyCode === currencyCode.toUpperCase(),
  );
};
