module.exports.registerRedboxExtension = () => ({
  apiVersion: 1,
  modules: [
    {
      name: 'counter',
      replaces: true,
      create: input => {
        input.created('commonjs');
        const values = [];
        return {
          values,
          initialize: async () => {
            values.push(input.label);
          },
          close: async () => {
            values.length = 0;
          },
        };
      },
    },
  ],
});
