/**
 * The 26 classical Gomoku openings.
 *
 * Centre is (7, 7), row 0 is the top, and each entry is the canonical
 * orientation: black at the centre, white adjacent, black's third stone.
 * Direct openings have white orthogonally adjacent; slanted ones, diagonally.
 * They are shape names for freestyle play, which has no renju forbidden points.
 */

export const OPENINGS = [
  { id: 1, name: 'Flower moon', chinese: '花月', family: 'direct', balance: 'black-favored', white: [6, 7], black: [6, 8], idea: 'White stands directly above the centre, and black steps diagonally beside that white stone.' },
  { id: 2, name: 'Rain moon', chinese: '雨月', family: 'direct', balance: 'black-favored', white: [6, 7], black: [7, 8], idea: 'White stands directly above the centre, and black plays beside the centre stone.' },
  { id: 3, name: 'Pine moon', chinese: '松月', family: 'direct', balance: 'black-favored', white: [6, 7], black: [8, 7], idea: 'White stands directly above the centre, and black plays directly below it.' },
  { id: 4, name: 'Stream moon', chinese: '溪月', family: 'direct', balance: 'black-favored', white: [6, 7], black: [5, 8], idea: 'White stands directly above the centre, and black jumps diagonally past that white stone.' },
  { id: 5, name: 'Cold star', chinese: '寒星', family: 'direct', balance: 'black-favored', white: [6, 7], black: [5, 7], idea: 'White stands directly above the centre, and black plays one point further along the same line.' },
  { id: 6, name: 'Auspicious star', chinese: '瑞星', family: 'direct', balance: 'black-favored', white: [6, 7], black: [9, 7], idea: 'White stands directly above the centre, and black plays one point below the centre, leaving a gap.' },
  { id: 7, name: 'Gold star', chinese: '金星', family: 'direct', balance: 'black-favored', white: [6, 7], black: [7, 9], idea: 'White stands directly above the centre, and black plays two points to the side of the centre.' },
  { id: 8, name: 'Po moon', chinese: '浦月', family: 'slanted', balance: 'black-favored', white: [6, 8], black: [8, 8], idea: 'White stands diagonally beside the centre, and black plays directly below that white stone.' },
  { id: 9, name: 'Cloud moon', chinese: '云月', family: 'slanted', balance: 'black-favored', white: [6, 8], black: [7, 8], idea: 'White stands diagonally beside the centre, and black plays between them on the white stone\'s file.' },
  { id: 10, name: 'Gorge moon', chinese: '峡月', family: 'slanted', balance: 'black-favored', white: [6, 8], black: [6, 9], idea: 'White stands diagonally beside the centre, and black plays one point further along white\'s rank.' },
  { id: 11, name: 'Silver moon', chinese: '银月', family: 'slanted', balance: 'black-favored', white: [6, 8], black: [8, 7], idea: 'White stands diagonally beside the centre, and black plays directly below the centre.' },
  { id: 12, name: 'Mist moon', chinese: '岚月', family: 'slanted', balance: 'black-favored', white: [6, 8], black: [9, 8], idea: 'White stands diagonally beside the centre, and black plays two points below that white stone.' },
  { id: 13, name: 'Famous moon', chinese: '名月', family: 'slanted', balance: 'black-favored', white: [6, 8], black: [9, 6], idea: 'White stands diagonally beside the centre, and black plays on the far diagonal.' },
  { id: 14, name: 'Water moon', chinese: '水月', family: 'slanted', balance: 'black-favored', white: [6, 8], black: [8, 9], idea: 'White stands diagonally beside the centre, and black plays a knight\'s move below it.' },
  { id: 15, name: 'Fixed star', chinese: '恒星', family: 'slanted', balance: 'black-favored', white: [6, 8], black: [7, 9], idea: 'White stands diagonally beside the centre, and black plays two points to the side.' },
  { id: 16, name: 'Bright star', chinese: '明星', family: 'slanted', balance: 'black-favored', white: [6, 8], black: [9, 7], idea: 'White stands diagonally beside the centre, and black plays two points below the centre.' },
  { id: 17, name: 'Waning moon', chinese: '残月', family: 'direct', balance: 'even', white: [6, 7], black: [6, 9], idea: 'White stands directly above the centre, and black plays two points to the side of that white stone.' },
  { id: 18, name: 'New moon', chinese: '新月', family: 'direct', balance: 'even', white: [6, 7], black: [8, 9], idea: 'White stands directly above the centre, and black plays well out on the diagonal.' },
  { id: 19, name: 'Hill moon', chinese: '丘月', family: 'direct', balance: 'even', white: [6, 7], black: [8, 8], idea: 'White stands directly above the centre, and black plays diagonally below the centre.' },
  { id: 20, name: 'Mountain moon', chinese: '山月', family: 'direct', balance: 'even', white: [6, 7], black: [9, 8], idea: 'White stands directly above the centre, and black plays two points below and one to the side.' },
  { id: 21, name: 'Wandering star', chinese: '游星', family: 'direct', balance: 'even', white: [6, 7], black: [9, 9], idea: 'White stands directly above the centre, and black plays on the long diagonal.' },
  { id: 22, name: 'Distant star', chinese: '疏星', family: 'direct', balance: 'even', white: [6, 7], black: [5, 9], idea: 'White stands directly above the centre, and black plays far to the side, above white.' },
  { id: 23, name: 'Slanted moon', chinese: '斜月', family: 'slanted', balance: 'even', white: [6, 8], black: [8, 6], idea: 'White stands diagonally beside the centre, and black plays on the opposite diagonal.' },
  { id: 24, name: 'Long star', chinese: '长星', family: 'slanted', balance: 'even', white: [6, 8], black: [5, 9], idea: 'White stands diagonally beside the centre, and black plays one point further along that diagonal.' },
  { id: 25, name: 'Shooting star', chinese: '流星', family: 'slanted', balance: 'even', white: [6, 8], black: [9, 9], idea: 'White stands diagonally beside the centre, and black plays two points further along that diagonal.' },
  { id: 26, name: 'Comet', chinese: '彗星', family: 'slanted', balance: 'even', white: [6, 8], black: [9, 5], idea: 'White stands diagonally beside the centre, and black plays on the far opposite side.' },
]
