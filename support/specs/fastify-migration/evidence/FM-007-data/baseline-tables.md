<!-- prettier-ignore -->
| Cell / all five values | Full completion p95 ms | Completed operations/s | MiB/s | TTFB p95 ms | Timed completions/run |
| --- | --- | --- | --- | --- | --- |
| [direct-W1-0-c1](express-02-direct-W1-0-c1-aggregate.json) | 91.42 [89.89, 93.86] | 12.68 [12.55, 12.78] | 0.10 [0.10, 0.10] | 91.38 [89.86, 93.83] | 1506–1534 |
| [direct-W1-0-c8](express-02-direct-W1-0-c8-aggregate.json) | 926.00 [908.79, 927.97] | 12.50 [12.38, 12.56] | 0.10 [0.10, 0.10] | 925.96 [908.73, 927.95] | 1485–1507 |
| [direct-W3-0-c1](express-02-direct-W3-0-c1-aggregate.json) | 23.02 [22.11, 23.93] | 52.57 [51.90, 53.72] | 0.48 [0.47, 0.49] | 22.23 [21.46, 22.97] | 6228–6446 |
| [direct-W3-0-c8](express-02-direct-W3-0-c8-aggregate.json) | 359.10 [307.42, 367.70] | 51.38 [49.86, 52.98] | 0.47 [0.45, 0.48] | 328.22 [283.80, 335.66] | 5983–6357 |
| [direct-W2-0-c1](express-02-direct-W2-0-c1-aggregate.json) | 211.93 [196.12, 273.59] | 6.70 [6.31, 6.76] | 0.01 [0.01, 0.01] | 211.90 [196.09, 273.55] | 757–811 |
| [direct-W2-0-c4](express-02-direct-W2-0-c4-aggregate.json) | 845.45 [844.17, 870.84] | 7.13 [6.85, 7.18] | 0.01 [0.01, 0.01] | 845.19 [844.15, 870.83] | 822–862 |
| [direct-W4-1048576-c1](express-02-direct-W4-1048576-c1-aggregate.json) | 23.83 [23.49, 25.49] | 62.75 [59.73, 62.97] | 62.75 [59.73, 62.97] | 19.19 [18.91, 21.14] | 7168–7556 |
| [direct-W4-1048576-c4](express-02-direct-W4-1048576-c4-aggregate.json) | 73.93 [71.65, 80.43] | 70.22 [68.77, 71.21] | 70.22 [68.77, 71.21] | 54.01 [52.30, 61.29] | 8252–8545 |
| [direct-W4-33554432-c1](express-02-direct-W4-33554432-c1-aggregate.json) | 379.75 [373.51, 386.37] | 5.30 [5.09, 5.39] | 169.60 [162.93, 172.53] | 107.27 [91.15, 145.32] | 611–647 |
| [direct-W4-33554432-c4](express-02-direct-W4-33554432-c4-aggregate.json) | 916.64 [875.23, 1197.73] | 6.06 [5.62, 6.52] | 193.87 [180.00, 208.53] | 285.17 [267.31, 291.87] | 675–782 |
| [proxy-W1-0-c1](express-02-proxy-W1-0-c1-aggregate.json) | 99.10 [96.39, 108.80] | 12.33 [11.38, 12.37] | 0.10 [0.09, 0.10] | 99.06 [96.36, 108.76] | 1365–1484 |
| [proxy-W1-0-c8](express-02-proxy-W1-0-c8-aggregate.json) | 920.80 [917.70, 935.87] | 12.27 [12.22, 12.31] | 0.10 [0.10, 0.10] | 920.63 [917.49, 935.67] | 1466–1477 |
| [proxy-W3-0-c1](express-02-proxy-W3-0-c1-aggregate.json) | 23.36 [23.12, 24.09] | 51.67 [51.18, 52.03] | 0.48 [0.48, 0.48] | 22.72 [22.56, 23.58] | 6142–6244 |
| [proxy-W3-0-c8](express-02-proxy-W3-0-c8-aggregate.json) | 338.53 [268.81, 377.41] | 52.21 [51.36, 53.05] | 0.49 [0.48, 0.49] | 304.97 [230.01, 328.40] | 6163–6366 |
| [proxy-W2-0-c1](express-02-proxy-W2-0-c1-aggregate.json) | 186.93 [177.14, 194.08] | 6.85 [6.72, 6.91] | 0.01 [0.01, 0.01] | 186.89 [177.12, 194.04] | 807–829 |
| [proxy-W2-0-c4](express-02-proxy-W2-0-c4-aggregate.json) | 852.71 [837.88, 878.52] | 7.09 [6.82, 7.14] | 0.01 [0.01, 0.01] | 852.70 [837.86, 878.51] | 818–857 |
| [proxy-W4-1048576-c1](express-02-proxy-W4-1048576-c1-aggregate.json) | 28.05 [27.33, 28.68] | 49.88 [48.83, 50.68] | 49.88 [48.83, 50.68] | 19.66 [18.78, 20.67] | 5859–6082 |
| [proxy-W4-1048576-c4](express-02-proxy-W4-1048576-c4-aggregate.json) | 89.72 [86.60, 92.19] | 57.25 [56.30, 58.04] | 57.25 [56.30, 58.04] | 67.34 [65.16, 69.11] | 6756–6965 |
| [proxy-W4-33554432-c1](express-02-proxy-W4-33554432-c1-aggregate.json) | 438.47 [432.40, 444.79] | 3.83 [3.57, 3.96] | 122.40 [114.13, 126.67] | 132.94 [117.11, 159.41] | 428–475 |
| [proxy-W4-33554432-c4](express-02-proxy-W4-33554432-c4-aggregate.json) | 1177.19 [1159.52, 1299.73] | 4.86 [4.48, 5.01] | 155.47 [143.47, 160.27] | 339.75 [331.74, 387.13] | 538–601 |

<!-- prettier-ignore -->
| Cell | Node CPU % of one core | Node RSS high-water MiB | Node heap high-water MiB | RSS after drain MiB | Heap after drain MiB | Completion + drain ms |
| --- | --- | --- | --- | --- | --- | --- |
| direct-W1-0-c1 | 97.72 [97.47, 97.77] | 530.26 [496.27, 531.47] | 323.45 [319.67, 330.81] | 520.32 [486.19, 525.94] | 257.19 [237.76, 286.00] | 26.11 [10.28, 50.06] |
| direct-W1-0-c8 | 99.02 [98.80, 99.65] | 519.79 [495.97, 569.25] | 323.11 [319.18, 325.93] | 498.61 [483.94, 561.43] | 294.65 [203.45, 310.75] | 384.21 [375.15, 737.09] |
| direct-W3-0-c1 | 91.75 [90.72, 92.25] | 501.28 [486.84, 528.25] | 271.68 [255.20, 278.95] | 443.61 [429.33, 474.12] | 220.05 [203.21, 237.23] | 12.40 [4.65, 25.09] |
| direct-W3-0-c8 | 98.15 [94.37, 98.31] | 555.89 [552.49, 562.95] | 323.33 [304.15, 328.95] | 534.02 [503.85, 549.70] | 218.55 [211.73, 272.14] | 113.31 [103.09, 171.75] |
| direct-W2-0-c1 | 93.23 [92.86, 93.96] | 495.87 [488.43, 543.90] | 329.14 [320.90, 341.02] | 496.00 [477.05, 532.54] | 258.46 [199.95, 319.40] | 166.33 [145.70, 487.62] |
| direct-W2-0-c4 | 96.70 [96.26, 97.39] | 532.48 [496.28, 536.75] | 329.80 [322.18, 333.87] | 509.28 [484.07, 514.54] | 282.57 [212.59, 300.14] | 21424.07 [17618.56, 22377.86] |
| direct-W4-1048576-c1 | 78.64 [76.02, 78.97] | 479.25 [459.16, 485.67] | 289.74 [282.32, 292.48] | 458.08 [426.69, 474.06] | 223.20 [191.71, 270.15] | 6.07 [4.38, 8.54] |
| direct-W4-1048576-c4 | 90.13 [88.98, 91.44] | 484.40 [478.96, 489.61] | 286.99 [284.47, 292.85] | 478.28 [446.11, 478.96] | 234.23 [199.77, 266.60] | 26.95 [11.10, 37.10] |
| direct-W4-33554432-c1 | 93.28 [92.53, 93.31] | 463.01 [452.22, 472.92] | 196.28 [195.39, 197.46] | 460.35 [431.29, 468.15] | 184.51 [182.78, 187.02] | 162.55 [88.55, 322.32] |
| direct-W4-33554432-c4 | 97.24 [89.66, 97.61] | 509.41 [498.32, 517.02] | 198.74 [197.54, 206.64] | 471.61 [442.65, 516.74] | 186.72 [185.80, 188.29] | 593.00 [76.88, 798.29] |
| proxy-W1-0-c1 | 97.40 [96.87, 98.57] | 519.70 [497.13, 527.91] | 321.93 [310.33, 324.03] | 504.93 [479.63, 506.54] | 247.65 [207.52, 269.73] | 31.01 [5.36, 71.88] |
| proxy-W1-0-c8 | 99.29 [99.17, 99.51] | 525.63 [500.84, 553.36] | 322.61 [315.75, 335.24] | 505.31 [480.64, 533.86] | 256.05 [210.01, 287.32] | 410.19 [279.46, 485.25] |
| proxy-W3-0-c1 | 90.77 [90.61, 90.94] | 496.40 [478.71, 558.31] | 278.03 [268.44, 344.31] | 442.44 [433.21, 470.56] | 225.25 [200.80, 264.93] | 36.04 [8.44, 84.12] |
| proxy-W3-0-c8 | 98.50 [97.39, 99.23] | 541.91 [536.25, 546.25] | 308.00 [282.55, 321.26] | 502.90 [455.25, 511.63] | 230.23 [210.39, 252.42] | 108.70 [107.69, 289.52] |
| proxy-W2-0-c1 | 93.97 [93.88, 95.12] | 504.10 [481.99, 525.83] | 321.36 [318.27, 332.76] | 499.09 [481.99, 521.91] | 273.27 [216.93, 310.50] | 197.84 [155.20, 250.74] |
| proxy-W2-0-c4 | 96.84 [95.52, 98.08] | 519.49 [493.75, 528.38] | 333.47 [324.02, 334.77] | 508.20 [479.76, 518.93] | 216.56 [206.65, 282.66] | 19570.48 [18954.97, 21841.14] |
| proxy-W4-1048576-c1 | 64.85 [64.35, 65.30] | 475.11 [462.98, 480.13] | 287.90 [282.15, 290.68] | 424.57 [410.93, 478.25] | 235.35 [203.72, 264.20] | 12.89 [4.06, 20.08] |
| proxy-W4-1048576-c4 | 75.28 [74.58, 75.60] | 482.29 [475.84, 511.04] | 289.11 [277.36, 290.23] | 469.15 [448.08, 496.96] | 202.59 [191.61, 265.55] | 34.57 [29.61, 171.44] |
| proxy-W4-33554432-c1 | 72.51 [68.32, 76.46] | 455.21 [448.76, 468.71] | 195.58 [194.63, 197.55] | 455.21 [385.01, 465.84] | 183.31 [182.13, 186.64] | 238.31 [140.72, 335.65] |
| proxy-W4-33554432-c4 | 83.23 [79.73, 86.26] | 480.38 [472.94, 495.55] | 198.53 [198.00, 200.83] | 481.43 [428.95, 491.32] | 187.30 [184.81, 188.67] | 545.01 [278.98, 661.37] |

<!-- prettier-ignore -->
| Cell | Full p95 variation | TTFB p95 variation | Operations/s variation | Bytes/s variation | Other Node/drain metrics above 10% | Provider/generator metrics above 10% |
| --- | --- | --- | --- | --- | --- | --- |
| direct-W1-0-c1 | 4.34% | 4.34% | 1.84% | 1.84% | retainedHeapMiB 18.75%; completionAndDrainMs 152.33% | fm007-solr.cpuPctOneCore 28.80%; generator.rssHighWaterMiB 10.35% |
| direct-W1-0-c8 | 2.07% | 2.08% | 1.47% | 1.47% | nodeRssHighWaterMiB 14.10%; retainedRssMiB 15.54%; retainedHeapMiB 36.42%; completionAndDrainMs 94.20% | fm007-portal.rssHighWaterMiB 14.09%; generator.rssHighWaterMiB 28.56% |
| direct-W3-0-c1 | 7.92% | 6.83% | 3.46% | 3.46% | retainedRssMiB 10.10%; retainedHeapMiB 15.46%; completionAndDrainMs 164.78% | generator.rssHighWaterMiB 16.81% |
| direct-W3-0-c8 | 16.78% | 15.80% | 6.07% | 6.07% | retainedHeapMiB 27.64%; completionAndDrainMs 60.59% | generator.rssHighWaterMiB 29.82% |
| direct-W2-0-c1 | 36.55% | 36.56% | 6.72% | 6.72% | nodeRssHighWaterMiB 11.19%; retainedRssMiB 11.19%; retainedHeapMiB 46.22%; completionAndDrainMs 205.57% | fm007-portal.rssHighWaterMiB 11.15%; fm007-solr.cpuPctOneCore 41.76%; generator.rssHighWaterMiB 19.78% |
| direct-W2-0-c4 | 3.15% | 3.16% | 4.67% | 4.69% | retainedHeapMiB 30.98%; completionAndDrainMs 22.21% | fm007-solr.cpuPctOneCore 11.24%; generator.rssHighWaterMiB 26.65% |
| direct-W4-1048576-c1 | 8.37% | 11.61% | 5.15% | 5.15% | retainedRssMiB 10.34%; retainedHeapMiB 35.14%; completionAndDrainMs 68.48% | None |
| direct-W4-1048576-c4 | 11.87% | 16.65% | 3.48% | 3.48% | retainedHeapMiB 28.53%; completionAndDrainMs 96.48% | None |
| direct-W4-33554432-c1 | 3.39% | 50.50% | 5.66% | 5.66% | completionAndDrainMs 143.81% | generator.rssHighWaterMiB 26.23% |
| direct-W4-33554432-c4 | 35.18% | 8.61% | 14.72% | 14.72% | retainedRssMiB 15.71%; completionAndDrainMs 121.65% | generator.cpuPctOneCore 12.19%; generator.rssHighWaterMiB 16.00% |
| proxy-W1-0-c1 | 12.52% | 12.51% | 8.04% | 8.04% | retainedHeapMiB 25.12%; completionAndDrainMs 214.54% | None |
| proxy-W1-0-c8 | 1.97% | 1.98% | 0.75% | 0.75% | retainedRssMiB 10.53%; retainedHeapMiB 30.20%; completionAndDrainMs 50.17% | generator.rssHighWaterMiB 22.42% |
| proxy-W3-0-c1 | 4.14% | 4.49% | 1.65% | 1.65% | nodeRssHighWaterMiB 16.04%; nodeHeapHighWaterMiB 27.29%; retainedHeapMiB 28.47%; completionAndDrainMs 209.97% | fm007-portal.rssHighWaterMiB 16.01% |
| proxy-W3-0-c8 | 32.08% | 32.26% | 3.24% | 3.24% | nodeHeapHighWaterMiB 12.57%; retainedRssMiB 11.21%; retainedHeapMiB 18.25%; completionAndDrainMs 167.28% | generator.rssHighWaterMiB 23.11% |
| proxy-W2-0-c1 | 9.06% | 9.05% | 2.68% | 2.68% | retainedHeapMiB 34.24%; completionAndDrainMs 48.29% | generator.rssHighWaterMiB 17.01% |
| proxy-W2-0-c4 | 4.77% | 4.77% | 4.58% | 4.60% | retainedHeapMiB 35.10%; completionAndDrainMs 14.75% | fm007-solr.cpuPctOneCore 10.45%; fm007-proxy.cpuPctOneCore 12.40% |
| proxy-W4-1048576-c1 | 4.79% | 9.63% | 3.73% | 3.73% | retainedRssMiB 15.86%; retainedHeapMiB 25.70%; completionAndDrainMs 124.21% | None |
| proxy-W4-1048576-c4 | 6.23% | 5.87% | 3.04% | 3.04% | retainedRssMiB 10.42%; retainedHeapMiB 36.50%; completionAndDrainMs 410.21% | None |
| proxy-W4-33554432-c1 | 2.83% | 31.82% | 10.24% | 10.24% | nodeCpuPct 11.22%; retainedRssMiB 17.76%; completionAndDrainMs 81.80% | fm007-portal.cpuPctOneCore 11.17%; fm007-proxy.cpuPctOneCore 20.87% |
| proxy-W4-33554432-c4 | 11.91% | 16.30% | 10.81% | 10.81% | retainedRssMiB 12.95%; completionAndDrainMs 70.16% | fm007-proxy.cpuPctOneCore 21.96%; generator.cpuPctOneCore 11.85%; generator.rssHighWaterMiB 20.70% |
