const HTTP_STATUS_CODE = {
  HTTP_STATUS_CODE_OK: 200,
  HTTP_STATUS_CODE_CREATED: 201,
  HTTP_STATUS_CODE_BAD_REQUEST: 400,
  HTTP_STATUS_CODE_UNAUTHORIZED: 401,
  HTTP_STATUS_CODE_FORBIDDEN: 403,
  HTTP_STATUS_CODE_NOT_FOUND: 404,
  HTTP_STATUS_CODE_INTERNAL_SERVER_ERROR: 500,
  HTTP_STATUS_CODE_NOT_IMPLEMENTED: 501,
};
const MYFIN = {
  DEFAULT_TRANSACTIONS_FETCH_LIMIT: 99999,
  TABLE_USERS: "users",
  TABLE_USER_NOTES_JOIN: "user_has_notes",
  TABLE_NOTES: "note",
  TABLE_CATEGORIES: "category",
  TABLE_NOTE_CATEGORIES_JOIN: "note_has_categories",
  TRX_TYPES: {
    INCOME: "I",
    EXPENSE: "E",
    TRANSFER: "T",
  },
  ACCOUNT_STATUS: {
    ACTIVE: "Ativa",
    INACTIVE: "Inativa",
  },
  ACCOUNT_TYPES: {
    CHECKING: "CHEAC",
    SAVINGS: "SAVAC",
    INVESTING: "INVAC",
    CREDIT: "CREAC",
    MEAL: "MEALAC",
    WALLET: "WALLET",
    OTHER: "OTHAC",
  },
  CATEGORY_STATUS: {
    ACTIVE: "Ativa",
    INACTIVE: "Inativa",
  },
  TRX_TYPE_LABEL: {
    DEBIT: "Débito",
    CREDIT: "Crédito",
  },
  RULES: {
    MATCHING: {
      IGNORE: "RULES_MATCHING_IGNORE",
    },
    OPERATOR: {
      IGNORE: "IG",
      EQUALS: "EQ",
      NOT_EQUALS: "NEQ",
      CONTAINS: "CONTAINS",
      NOT_CONTAINS: "NOTCONTAINS",
    },
  },
  INVEST: {
    TRX_TYPE: {
      BUY: "B",
      SELL: "S",
    },
    ASSET_TYPE: {
      PPR: "ppr",
      ETF: "etf",
      CRYPTO: "crypto",
      FIXED_INCOME: "fixed",
      INDEX_FUNDS: "index",
      INVESTMENT_FUNDS: "if",
      P2P: "p2p",
      STOCKS: "stocks",
    },
  },
  CURRENCIES: {
    EUR: {
      symbol: "€",
      code: "EUR",
      name: "Euro"
    },
    USD: {
      symbol: "$",
      code: "USD",
      name: "United States Dollar"
    },
    CHF: {
      symbol: "CHF",
      code: "CHF",
      name: "Schweizer Franken"
    },
    BRL: {
      symbol: "R$",
      code: "BRL",
      name: "Real Brasileiro"
    },
    GBP: {
      symbol: "£",
      code: "GBP",
      name: "Pound Sterling"
    },
    CAD: {
      symbol: "C$",
      code: "CAD",
      name: "Dollar Canadien"
    },
    MXN: {
      symbol: "MX$",
      code: "MXN",
      name: "Peso Mexicano"
    },
    JPY: {
      symbol: "¥",
      code: "JPY",
      name: "日本円 (Nihon En)"
    },
    AUD: {
      symbol: "A$",
      code: "AUD",
      name: "Australian Dollar"
    },
    INR: {
      symbol: "₹",
      code: "INR",
      name: "भारतीय रुपया (Bhāratīya Rupayā)"
    },
    DKK: {
      symbol: "kr",
      code: "DKK",
      name: "Dansk Krone"
    },
    SEK: {
      symbol: "kr",
      code: "SEK",
      name: "Svensk Krona"
    },
    NOK: {
      symbol: "kr",
      code: "NOK",
      name: "Norsk Krone"
    },
    PLN: {
      symbol: "zł",
      code: "PLN",
      name: "Polski Złoty"
    },
    ISK: {
      symbol: "kr",
      code: "ISK",
      name: "Íslensk Króna"
    },
    CZK: {
      symbol: "Kč",
      code: "CZK",
      name: "Česká Koruna"
    },
    HUF: {
      symbol: "Ft",
      code: "HUF",
      name: "Magyar Forint"
    },
    RON: {
      symbol: "lei",
      code: "RON",
      name: "Leu Românesc"
    },
    CNY: {
      symbol: "¥",
      code: "CNY",
      name: "人民币 (Chinese Yuan)" }
  },
};

export { HTTP_STATUS_CODE, MYFIN };
