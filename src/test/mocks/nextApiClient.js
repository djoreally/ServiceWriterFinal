module.exports = {
  nextApi: {
    invoices: {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    },
    payments: {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      action: jest.fn(),
    },
  },
};
