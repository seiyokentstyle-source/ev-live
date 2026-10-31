import type { FloorLayout, FloorSeat } from "./types";

/**
 * Numbered positions transcribed from YouTuber Souken's public Island map.
 * Coordinates use its 1662 × 971 canvas. The map does not state its layout date.
 * Nulls preserve the visibly unnumbered gaps; newer seats are never invented.
 * Cross-reference: the store's 2026-10-19 official BF map describes 395 slots.
 */
const seats: FloorSeat[] = [];
const WIDTH = 38;
const HEIGHT = 25;

function column(x: number, y: number, units: readonly (number | null)[]) {
  units.forEach((unit, index) => {
    if (unit !== null) seats.push({ unit: String(unit), x, y: y + index * HEIGHT, width: WIDTH, height: HEIGHT });
  });
}

function row(x: number, y: number, units: readonly number[]) {
  units.forEach((unit, index) => seats.push({ unit: String(unit), x: x + index * WIDTH, y, width: WIDTH, height: HEIGHT }));
}

// Outside wall, left side and bottom edge.
column(14, 210, [713, 712, 711, 710, 708, 707, 706, 705, 703, 702, 701, 700, 688, 687, 686, 685, 683, 682, 681, 680, 678, 677, 676, 675, 673, 672, 671, 670, 668]);
row(52, 935, [667, 666, 665, 663, 662, 661, 660, 658, 657, 656, 655, 653, 652, 651, 650, 638, 637, 636]);

// First two short islands on the left.
column(128, 210, [715, 716, 717, 718, 720, 721, 722, 723, 725, 726]);
column(166, 210, [783, 782, 781, 780, 778, 777, 776, 775, 773, 772]);
column(128, 510, [727, 728, 730, 731, 732, 733, 735, 736, 737, 738, 750, 751, 752, 753]);
column(166, 510, [771, 770, 768, 767, 766, 765, 763, 762, 761, 760, 758, 757, 756, 755]);
column(280, 210, [785, 786, 787, 788, 800, 801, 802, 803, 805, 806]);

// Lower central islands; the source's gray cells remain gaps.
column(280, 535, [807, 808, 810, null, 811, 812, 813, 815, 816, 817, 818, 820, 821]);
column(318, 535, [836, 835, 833, null, 832, 831, 830, 828, 827, 826, 825, 823, 822]);
column(432, 535, [837, 838, 850, 851, 852, 853, 855, 856, 857, 858, 860, 861, 862]);
column(470, 535, [878, 877, 876, 875, 873, 872, 871, 870, 868, 867, 866, 865, 863]);

// Upper central islands, alongside the source's stair/wall space.
column(470, 85, [1007, 1006, 1005, 1003, 1002, 1001, 1000, 888, 887, 886, 885, 883, 882, 881, 880]);
column(584, 85, [1008, 1010, 1011, 1012, 1013, 1015, 1016, 1017, null, null, 1018, 1020, 1021, 1022, 1023, 1025]);
column(622, 85, [1085, 1083, 1082, 1081, 1080, 1078, 1077, 1076, 1075, 1073, 1072, 1071, 1070, 1068, 1067, 1066]);
column(584, 535, [1026, 1027, 1028, 1030, 1031, 1032, 1033, 1035, 1036, 1037, 1038, 1050, 1051]);
column(622, 535, [1065, 1063, null, null, 1062, 1061, 1060, 1058, 1057, 1056, 1055, 1053, 1052]);
column(736, 85, [1086, 1087, 1088, 1100, 1101, 1102, 1103, 1105, 1106, 1107, 1108, 1110, 1111, 1112, 1113, 1115, 1116]);
column(774, 85, [1137, 1136, 1135, 1133, 1132, 1131, 1130, 1128, 1127, 1126, 1125, 1123, 1122, 1121, 1120, 1118, 1117]);
column(888, 85, [1138, 1150, 1151, 1152, 1153, 1155, 1156, 1157, null, null, 1158, 1160, 1161, 1162, 1163, 1165, 1166]);
column(926, 85, [1187, 1186, 1185, 1183, 1182, 1181, 1180, 1178, 1177, 1176, 1175, 1173, 1172, 1171, 1170, 1168, 1167]);

// Top and right wing.
row(1116, 10, [1188, 1200, 1201, 1202, 1203, 1205, 1206, 1207, 1208, 1210, 1211, 1212, 1213]);
column(1610, 60, [1215, 1216, 1217, 1218, 1220, 1221, 1222, 1223, 1225]);
row(1116, 85, [1277, 1278, 1280, 1281, 1282, 1283, 1285, 1286, 1287, 1288, 1300]);
row(1116, 110, [1276, 1275, 1273, 1272, 1271, 1270, 1268, 1267, 1266, 1265, 1263]);
row(1116, 185, [1250, 1251, 1252, 1253, 1255, 1256, 1257, 1258, 1260, 1261, 1262]);
row(1116, 210, [1238, 1237, 1236, 1235, 1233, 1232, 1231, 1230, 1228, 1227, 1226]);

// Inside edge and the narrow variety-side leg.
column(1078, 335, [600, 601, 602, 603, 605, 606, 607, 608, 610, 611]);
row(850, 585, [618, 617, 616, 615, 613, 612]);
column(736, 610, [620, 621, 622, 623, 625, 626, 627, 628, 630, 631, 632, 633, 635]);

export const AKIHABARA_FLOOR: FloorLayout = {
  width: 1662,
  height: 971,
  sourceUrl: "https://youtubersouken.com/island_akb_shimazu.png",
  asOf: "配置基準日未記載",
  layoutNote: "公開番号図で確認できた位置を表示しています。公式の2026/10/19島図（395台）と台数が異なるため、番号図にない台の位置は推定せず、未配置の一覧に分けています。",
  labels: [{ text: "BF スロット", x: 28, y: 30 }],
  seats,
};
