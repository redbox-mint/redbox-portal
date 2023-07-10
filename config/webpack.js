const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const path = require('path');
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

const cssFilePath = '../default/default/styles/style.min.css';
module.exports.webpack = {
  config: [
    {
      stats: {
        loggingDebug: ["sass-loader"],
      },
      // webpack no longer runs in production mode, assume non-'docker' values to be production mode
      mode: process.env.NODE_ENV === 'docker' ? 'development' : 'production',
      devtool: process.env.NODE_ENV === 'docker' ? 'eval-source-map' : undefined,
      entry: './assets/styles/style.scss',
      output: {
        filename: 'index.bundle.js',
        path: path.resolve(__dirname, '../.tmp/public/styles'),
        publicPath: '/'
      },
      plugins: [
        new MiniCssExtractPlugin({
          // Relative to 'output.path' above!
          filename: cssFilePath
        }),
        new CopyPlugin({
          patterns: [
            {
              // https://www.npmjs.com/package/copy-webpack-plugin#from
              from: './assets',
              // Relative to 'output.path' above!
              to: '../',
              globOptions: {
                ignore: ['*js/**/*', '**/*.gitkeep', '**/*.scss', '**/*.less']
              }
            },
            {
              from: './node_modules/bootstrap/dist/js/bootstrap.bundle.min.js',
              to: '../default/default/js/'
            },
            {
              from: './node_modules/jquery/dist/jquery.min.js',
              to: '../default/default/js/'
            },
            {
              from: './angular-legacy/node_modules/bootstrap-datepicker/js/bootstrap-datepicker.js',
              to: '../default/default/js/'
            },
            {
              from: './angular-legacy/node_modules/bootstrap-timepicker/js/bootstrap-timepicker.js',
              to: '../default/default/js/'
            }
          ],
        }),
      ],
      module: {
        rules: [
          {
            test: /\.scss$/i,
            exclude: /\.\.\/angular/,
            use: [
              MiniCssExtractPlugin.loader,
              "css-loader",
              "sass-loader"
            ],
            include: [
              path.resolve(__dirname, '../assets/styles')
            ]
          },
          {
            test: /\.(woff2?|ttf|otf|eot|svg)$/,
            type: 'asset/inline',
            exclude: /\.\.\/angular/
          },
          {
            test: /\.css$/,
            exclude: /\.\.\/angular/,
            use: [MiniCssExtractPlugin.loader, "css-loader"],
            include: [
              path.resolve(__dirname, '../.tmp/public/default/default/styles')
            ]
          },
        ]
      },
      optimization: {
        minimizer: [
          // For webpack@5 you can use the `...` syntax to extend existing minimizers (i.e. `terser-webpack-plugin`), uncomment the next line
          // `...`,
          new CssMinimizerPlugin(),
        ],
        // disabled by default for local development
        minimize: false,
      }
    }
  ],
  watch:false,
  watchOptions: {
    ignored: [
      "support/**/*",
      "node_modules/**/*"
    ]
  }
};