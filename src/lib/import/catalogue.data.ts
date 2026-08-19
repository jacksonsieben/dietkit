import type { Catalogue } from "./catalogue";

/**
 * The tables themselves, generated from the predecessor's `diet_data.py` and
 * then left alone (see `catalogue.ts` for why "left alone" is the point).
 *
 * A separate file from the types so that the ~26 kB of data can be loaded on
 * demand: the import screen is the only thing that needs it, and nobody who
 * never had a predecessor profile should pay for it on first paint.
 */
export const PREDECESSOR_CATALOGUE: Catalogue = {
  "foods": {
    "arroz_branco_cozido": {
      "name": "Arroz branco cozido",
      "per100g": {
        "kcal": 128.26,
        "proteinG": 2.52,
        "carbG": 28.06,
        "fatG": 0.23
      }
    },
    "batata_inglesa_cozida": {
      "name": "Batata inglesa cozida",
      "per100g": {
        "kcal": 51.59,
        "proteinG": 1.16,
        "carbG": 11.94,
        "fatG": 0.0
      }
    },
    "batata_doce_cozida": {
      "name": "Batata-doce cozida",
      "per100g": {
        "kcal": 76.76,
        "proteinG": 0.64,
        "carbG": 18.42,
        "fatG": 0.09
      }
    },
    "macarrao_cozido": {
      "name": "Macarrão cozido",
      "per100g": {
        "kcal": 126.0,
        "proteinG": 5.0,
        "carbG": 25.0,
        "fatG": 0.5
      }
    },
    "pao_branco_fatiado": {
      "name": "Pão branco fatiado",
      "per100g": {
        "kcal": 265.0,
        "proteinG": 8.0,
        "carbG": 49.0,
        "fatG": 3.2
      }
    },
    "pao_frances": {
      "name": "Pão francês",
      "per100g": {
        "kcal": 299.81,
        "proteinG": 7.95,
        "carbG": 58.65,
        "fatG": 3.1
      }
    },
    "aveia_flocos": {
      "name": "Aveia em flocos",
      "per100g": {
        "kcal": 393.82,
        "proteinG": 13.92,
        "carbG": 66.64,
        "fatG": 8.5
      }
    },
    "farinha_tapioca": {
      "name": "Farinha de tapioca",
      "per100g": {
        "kcal": 343.0,
        "proteinG": 0.2,
        "carbG": 85.0,
        "fatG": 0.02
      }
    },
    "whey_protein": {
      "name": "Whey protein",
      "per100g": {
        "kcal": 375.0,
        "proteinG": 80.0,
        "carbG": 7.0,
        "fatG": 3.0
      }
    },
    "leite_desnatado": {
      "name": "Leite desnatado",
      "per100g": {
        "kcal": 35.0,
        "proteinG": 3.4,
        "carbG": 5.0,
        "fatG": 0.1
      }
    },
    "carne_bovina_magra": {
      "name": "Carne bovina magra grelhada",
      "per100g": {
        "kcal": 219.26,
        "proteinG": 35.9,
        "carbG": 0.0,
        "fatG": 7.31
      }
    },
    "peito_frango_grelhado": {
      "name": "Peito de frango grelhado",
      "per100g": {
        "kcal": 159.19,
        "proteinG": 32.03,
        "carbG": 0.0,
        "fatG": 2.48
      }
    },
    "lombo_porco_assado": {
      "name": "Lombo de porco assado",
      "per100g": {
        "kcal": 210.23,
        "proteinG": 35.73,
        "carbG": 0.0,
        "fatG": 6.4
      }
    },
    "tilapia_cozida": {
      "name": "Tilápia cozida",
      "per100g": {
        "kcal": 128.0,
        "proteinG": 26.0,
        "carbG": 0.0,
        "fatG": 2.7
      }
    },
    "ovo_inteiro_cozido": {
      "name": "Ovo inteiro cozido",
      "per100g": {
        "kcal": 145.7,
        "proteinG": 13.29,
        "carbG": 0.61,
        "fatG": 9.48
      }
    },
    "clara_cozida": {
      "name": "Clara de ovo cozida",
      "per100g": {
        "kcal": 59.44,
        "proteinG": 13.45,
        "carbG": 0.0,
        "fatG": 0.09
      }
    },
    "iogurte_desnatado": {
      "name": "Iogurte natural desnatado",
      "per100g": {
        "kcal": 41.49,
        "proteinG": 3.83,
        "carbG": 5.77,
        "fatG": 0.32
      }
    },
    "doce_de_leite": {
      "name": "Doce de leite",
      "per100g": {
        "kcal": 306.31,
        "proteinG": 5.48,
        "carbG": 59.49,
        "fatG": 5.99
      }
    },
    "geleia_tradicional": {
      "name": "Geleia tradicional",
      "per100g": {
        "kcal": 260.0,
        "proteinG": 0.3,
        "carbG": 65.0,
        "fatG": 0.1
      }
    },
    "pasta_amendoim": {
      "name": "Pasta de amendoim",
      "per100g": {
        "kcal": 588.0,
        "proteinG": 25.0,
        "carbG": 22.0,
        "fatG": 50.0
      }
    },
    "azeite_oliva": {
      "name": "Azeite de oliva",
      "per100g": {
        "kcal": 884.0,
        "proteinG": 0.0,
        "carbG": 0.0,
        "fatG": 100.0
      }
    },
    "morango": {
      "name": "Morango",
      "per100g": {
        "kcal": 30.15,
        "proteinG": 0.89,
        "carbG": 6.82,
        "fatG": 0.31
      }
    },
    "maca": {
      "name": "Maçã",
      "per100g": {
        "kcal": 55.52,
        "proteinG": 0.29,
        "carbG": 15.15,
        "fatG": 0.0
      }
    },
    "pera": {
      "name": "Pêra",
      "per100g": {
        "kcal": 60.59,
        "proteinG": 0.24,
        "carbG": 16.07,
        "fatG": 0.23
      }
    },
    "mamao_papaia": {
      "name": "Mamão papaia",
      "per100g": {
        "kcal": 40.16,
        "proteinG": 0.46,
        "carbG": 10.44,
        "fatG": 0.12
      }
    },
    "melao": {
      "name": "Melão",
      "per100g": {
        "kcal": 29.37,
        "proteinG": 0.68,
        "carbG": 7.53,
        "fatG": 0.0
      }
    },
    "maracuja": {
      "name": "Maracujá",
      "per100g": {
        "kcal": 68.44,
        "proteinG": 1.99,
        "carbG": 12.26,
        "fatG": 2.1
      }
    },
    "banana": {
      "name": "Banana",
      "per100g": {
        "kcal": 95.0,
        "proteinG": 1.2,
        "carbG": 23.0,
        "fatG": 0.3
      }
    },
    "uva_branca": {
      "name": "Uva branca",
      "per100g": {
        "kcal": 69.0,
        "proteinG": 0.7,
        "carbG": 17.7,
        "fatG": 0.15
      }
    },
    "uva_roxa": {
      "name": "Uva roxa",
      "per100g": {
        "kcal": 69.0,
        "proteinG": 0.7,
        "carbG": 17.7,
        "fatG": 0.15
      }
    },
    "cenoura_cozida": {
      "name": "Cenoura cozida",
      "per100g": {
        "kcal": 29.86,
        "proteinG": 0.85,
        "carbG": 6.69,
        "fatG": 0.22
      }
    },
    "beterraba_cozida": {
      "name": "Beterraba cozida",
      "per100g": {
        "kcal": 32.15,
        "proteinG": 1.29,
        "carbG": 7.23,
        "fatG": 0.09
      }
    },
    "brocolis_cozido": {
      "name": "Brócolis cozido",
      "per100g": {
        "kcal": 24.64,
        "proteinG": 2.13,
        "carbG": 4.37,
        "fatG": 0.46
      }
    },
    "abobrinha_cozida": {
      "name": "Abobrinha cozida",
      "per100g": {
        "kcal": 15.04,
        "proteinG": 1.13,
        "carbG": 2.98,
        "fatG": 0.2
      }
    },
    "cabotia_cozida": {
      "name": "Cabotiá cozida",
      "per100g": {
        "kcal": 34.0,
        "proteinG": 0.7,
        "carbG": 7.0,
        "fatG": 0.1
      }
    },
    "amendoas": {
      "name": "Amêndoas",
      "per100g": {
        "kcal": 579.0,
        "proteinG": 21.15,
        "carbG": 21.55,
        "fatG": 49.93
      }
    },
    "castanha_para": {
      "name": "Castanha-do-Pará",
      "per100g": {
        "kcal": 659.0,
        "proteinG": 14.32,
        "carbG": 12.27,
        "fatG": 67.1
      }
    },
    "castanha_caju": {
      "name": "Castanha de caju",
      "per100g": {
        "kcal": 553.0,
        "proteinG": 18.22,
        "carbG": 30.19,
        "fatG": 43.85
      }
    },
    "nozes": {
      "name": "Nozes",
      "per100g": {
        "kcal": 654.0,
        "proteinG": 15.23,
        "carbG": 13.71,
        "fatG": 65.21
      }
    }
  },
  "meals": [
    {
      "id": 1,
      "name": "Refeição 1",
      "note": "Café da manhã",
      "carbOptions": [
        {
          "id": "r1_c1",
          "label": "Pão branco + fruta + doce de leite",
          "items": [
            {
              "foodKey": "pao_branco_fatiado",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 50.0,
                "descanso": 50.0
              },
              "unit": "g",
              "note": "2 fatias de 25g"
            },
            {
              "foodKey": "morango",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 192.0,
                "descanso": 192.0
              },
              "unit": "g",
              "note": "1 fruta — ver opções de fruta"
            },
            {
              "foodKey": "doce_de_leite",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 20.0,
                "descanso": 20.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r1_c2",
          "label": "Pão francês + fruta + geleia",
          "items": [
            {
              "foodKey": "pao_frances",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 50.0,
                "descanso": 50.0
              },
              "unit": "g",
              "note": "1 pão francês"
            },
            {
              "foodKey": "morango",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 192.0,
                "descanso": 192.0
              },
              "unit": "g",
              "note": "1 fruta — ver opções de fruta"
            },
            {
              "foodKey": "geleia_tradicional",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 20.0,
                "descanso": 20.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r1_c3",
          "label": "Aveia + fruta + pasta de amendoim",
          "items": [
            {
              "foodKey": "aveia_flocos",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 40.0,
                "descanso": 40.0
              },
              "unit": "g",
              "note": null
            },
            {
              "foodKey": "morango",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 192.0,
                "descanso": 192.0
              },
              "unit": "g",
              "note": "1 fruta — ver opções de fruta"
            },
            {
              "foodKey": "pasta_amendoim",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 10.0,
                "descanso": 10.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r1_c4",
          "label": "Tapioca + fruta + doce de leite",
          "items": [
            {
              "foodKey": "farinha_tapioca",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 40.0,
                "descanso": 40.0
              },
              "unit": "g",
              "note": null
            },
            {
              "foodKey": "morango",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 192.0,
                "descanso": 192.0
              },
              "unit": "g",
              "note": "1 fruta — ver opções de fruta"
            },
            {
              "foodKey": "doce_de_leite",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 20.0,
                "descanso": 20.0
              },
              "unit": "g",
              "note": null
            }
          ]
        }
      ],
      "proteinOptions": [
        {
          "id": "r1_p1",
          "label": "Whey + Leite desnatado",
          "items": [
            {
              "foodKey": "whey_protein",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 50.0,
                "descanso": 50.0
              },
              "unit": "g",
              "note": null
            },
            {
              "foodKey": "leite_desnatado",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "ml",
              "note": "ou 170g de iogurte natural desnatado"
            }
          ]
        },
        {
          "id": "r1_p2",
          "label": "Carne bovina + Leite desnatado",
          "items": [
            {
              "foodKey": "carne_bovina_magra",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 100.0,
                "descanso": 100.0
              },
              "unit": "g",
              "note": "ou 130g de frango — ver opção r1_p3"
            },
            {
              "foodKey": "leite_desnatado",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "ml",
              "note": "ou 170g de iogurte natural desnatado"
            }
          ]
        },
        {
          "id": "r1_p3",
          "label": "Frango + Leite desnatado",
          "items": [
            {
              "foodKey": "peito_frango_grelhado",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 130.0,
                "descanso": 130.0
              },
              "unit": "g",
              "note": "ou 100g de carne — ver opção r1_p2"
            },
            {
              "foodKey": "leite_desnatado",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "ml",
              "note": "ou 170g de iogurte natural desnatado"
            }
          ]
        },
        {
          "id": "r1_p4",
          "label": "3 Ovos inteiros + 7 Claras + Leite",
          "items": [
            {
              "foodKey": "ovo_inteiro_cozido",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 150.0,
                "descanso": 150.0
              },
              "unit": "g",
              "note": "3 ovos inteiros"
            },
            {
              "foodKey": "clara_cozida",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 210.0,
                "descanso": 210.0
              },
              "unit": "g",
              "note": "7 claras"
            },
            {
              "foodKey": "leite_desnatado",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "ml",
              "note": "ou 170g de iogurte natural desnatado"
            }
          ]
        },
        {
          "id": "r1_p5",
          "label": "Só Claras (13) + Leite",
          "items": [
            {
              "foodKey": "clara_cozida",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 390.0,
                "descanso": 390.0
              },
              "unit": "g",
              "note": "~13 claras (~390g)"
            },
            {
              "foodKey": "leite_desnatado",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "ml",
              "note": "ou 170g de iogurte natural desnatado"
            }
          ]
        }
      ],
      "fixed": [
        {
          "foodKey": null,
          "label": "Ômega 3",
          "scalable": false,
          "baseQtyG": {
            "treino": 1.0,
            "descanso": 1.0
          },
          "unit": "dose",
          "note": null
        },
        {
          "foodKey": null,
          "label": "Canela",
          "scalable": false,
          "baseQtyG": {
            "treino": 3.0,
            "descanso": 3.0
          },
          "unit": "g",
          "note": null
        }
      ]
    },
    {
      "id": 2,
      "name": "Refeição 2",
      "note": "Almoço",
      "carbOptions": [
        {
          "id": "r2_c1",
          "label": "Arroz branco",
          "items": [
            {
              "foodKey": "arroz_branco_cozido",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 250.0,
                "descanso": 180.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r2_c2",
          "label": "Batata inglesa",
          "items": [
            {
              "foodKey": "batata_inglesa_cozida",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 300.0,
                "descanso": 210.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r2_c3",
          "label": "Macarrão",
          "items": [
            {
              "foodKey": "macarrao_cozido",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 230.0,
                "descanso": 165.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r2_c4",
          "label": "Batata-doce",
          "items": [
            {
              "foodKey": "batata_doce_cozida",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 300.0,
                "descanso": 220.0
              },
              "unit": "g",
              "note": null
            }
          ]
        }
      ],
      "proteinOptions": [
        {
          "id": "r2_p1",
          "label": "Lombo de porco",
          "items": [
            {
              "foodKey": "lombo_porco_assado",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 120.0,
                "descanso": 120.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r2_p2",
          "label": "Tilápia",
          "items": [
            {
              "foodKey": "tilapia_cozida",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r2_p3",
          "label": "Peito de frango",
          "items": [
            {
              "foodKey": "peito_frango_grelhado",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 150.0,
                "descanso": 150.0
              },
              "unit": "g",
              "note": null
            }
          ]
        }
      ],
      "fixed": [
        {
          "foodKey": "cenoura_cozida",
          "label": "Legume (cenoura, beterraba, brócolis, abobrinha ou cabotiá)",
          "scalable": false,
          "baseQtyG": {
            "treino": 100.0,
            "descanso": 100.0
          },
          "unit": "g",
          "note": null
        },
        {
          "foodKey": null,
          "label": "Salada de folhas verdes à vontade",
          "scalable": false,
          "baseQtyG": null,
          "unit": null,
          "note": null
        },
        {
          "foodKey": "azeite_oliva",
          "label": "Azeite de oliva",
          "scalable": false,
          "baseQtyG": {
            "treino": 5.0,
            "descanso": 5.0
          },
          "unit": "ml",
          "note": null
        }
      ]
    },
    {
      "id": 3,
      "name": "Refeição 3",
      "note": "Lanche / Pré-treino",
      "carbOptions": [
        {
          "id": "r3_c1",
          "label": "Pão branco + fruta + doce de leite",
          "items": [
            {
              "foodKey": "pao_branco_fatiado",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 25.0,
                "descanso": 25.0
              },
              "unit": "g",
              "note": "1 fatia de 25g"
            },
            {
              "foodKey": "morango",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 192.0,
                "descanso": 192.0
              },
              "unit": "g",
              "note": "1 fruta — ver opções de fruta"
            },
            {
              "foodKey": "doce_de_leite",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 20.0,
                "descanso": 20.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r3_c2",
          "label": "½ Pão francês + fruta + geleia",
          "items": [
            {
              "foodKey": "pao_frances",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 25.0,
                "descanso": 25.0
              },
              "unit": "g",
              "note": "½ pão francês"
            },
            {
              "foodKey": "morango",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 192.0,
                "descanso": 192.0
              },
              "unit": "g",
              "note": "1 fruta — ver opções de fruta"
            },
            {
              "foodKey": "geleia_tradicional",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 20.0,
                "descanso": 20.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r3_c3",
          "label": "Aveia + fruta + pasta de amendoim",
          "items": [
            {
              "foodKey": "aveia_flocos",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 20.0,
                "descanso": 20.0
              },
              "unit": "g",
              "note": null
            },
            {
              "foodKey": "morango",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 192.0,
                "descanso": 192.0
              },
              "unit": "g",
              "note": "1 fruta — ver opções de fruta"
            },
            {
              "foodKey": "pasta_amendoim",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 10.0,
                "descanso": 10.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r3_c4",
          "label": "Tapioca + fruta + doce de leite",
          "items": [
            {
              "foodKey": "farinha_tapioca",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 20.0,
                "descanso": 20.0
              },
              "unit": "g",
              "note": null
            },
            {
              "foodKey": "morango",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 192.0,
                "descanso": 192.0
              },
              "unit": "g",
              "note": "1 fruta — ver opções de fruta"
            },
            {
              "foodKey": "doce_de_leite",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 20.0,
                "descanso": 20.0
              },
              "unit": "g",
              "note": null
            }
          ]
        }
      ],
      "proteinOptions": [
        {
          "id": "r3_p1",
          "label": "Whey + Leite desnatado",
          "items": [
            {
              "foodKey": "whey_protein",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 20.0,
                "descanso": 20.0
              },
              "unit": "g",
              "note": null
            },
            {
              "foodKey": "leite_desnatado",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "ml",
              "note": "ou 170g de iogurte natural desnatado"
            }
          ]
        },
        {
          "id": "r3_p2",
          "label": "Carne bovina + Leite desnatado",
          "items": [
            {
              "foodKey": "carne_bovina_magra",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 40.0,
                "descanso": 40.0
              },
              "unit": "g",
              "note": "ou 55g de frango — ver r3_p3"
            },
            {
              "foodKey": "leite_desnatado",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "ml",
              "note": "ou 170g de iogurte natural desnatado"
            }
          ]
        },
        {
          "id": "r3_p3",
          "label": "Frango + Leite desnatado",
          "items": [
            {
              "foodKey": "peito_frango_grelhado",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 55.0,
                "descanso": 55.0
              },
              "unit": "g",
              "note": "ou 40g de carne — ver r3_p2"
            },
            {
              "foodKey": "leite_desnatado",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "ml",
              "note": "ou 170g de iogurte natural desnatado"
            }
          ]
        },
        {
          "id": "r3_p4",
          "label": "1 Ovo inteiro + 3 Claras + Leite",
          "items": [
            {
              "foodKey": "ovo_inteiro_cozido",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 50.0,
                "descanso": 50.0
              },
              "unit": "g",
              "note": "1 ovo inteiro"
            },
            {
              "foodKey": "clara_cozida",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 90.0,
                "descanso": 90.0
              },
              "unit": "g",
              "note": "3 claras"
            },
            {
              "foodKey": "leite_desnatado",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "ml",
              "note": "ou 170g de iogurte natural desnatado"
            }
          ]
        },
        {
          "id": "r3_p5",
          "label": "Só Claras (5) + Leite",
          "items": [
            {
              "foodKey": "clara_cozida",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 150.0,
                "descanso": 150.0
              },
              "unit": "g",
              "note": "~5 claras (~150g)"
            },
            {
              "foodKey": "leite_desnatado",
              "label": null,
              "scalable": false,
              "baseQtyG": {
                "treino": 200.0,
                "descanso": 200.0
              },
              "unit": "ml",
              "note": "ou 170g de iogurte natural desnatado"
            }
          ]
        }
      ],
      "fixed": []
    },
    {
      "id": 4,
      "name": "Refeição 4",
      "note": "Jantar",
      "carbOptions": [
        {
          "id": "r4_c1",
          "label": "Arroz branco",
          "items": [
            {
              "foodKey": "arroz_branco_cozido",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 300.0,
                "descanso": 200.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r4_c2",
          "label": "Batata inglesa",
          "items": [
            {
              "foodKey": "batata_inglesa_cozida",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 350.0,
                "descanso": 230.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r4_c3",
          "label": "Macarrão",
          "items": [
            {
              "foodKey": "macarrao_cozido",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 275.0,
                "descanso": 185.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r4_c4",
          "label": "Batata-doce",
          "items": [
            {
              "foodKey": "batata_doce_cozida",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 360.0,
                "descanso": 245.0
              },
              "unit": "g",
              "note": null
            }
          ]
        }
      ],
      "proteinOptions": [
        {
          "id": "r4_p1",
          "label": "Lombo de porco",
          "items": [
            {
              "foodKey": "lombo_porco_assado",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 150.0,
                "descanso": 150.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r4_p2",
          "label": "Tilápia",
          "items": [
            {
              "foodKey": "tilapia_cozida",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 250.0,
                "descanso": 250.0
              },
              "unit": "g",
              "note": null
            }
          ]
        },
        {
          "id": "r4_p3",
          "label": "Peito de frango",
          "items": [
            {
              "foodKey": "peito_frango_grelhado",
              "label": null,
              "scalable": true,
              "baseQtyG": {
                "treino": 185.0,
                "descanso": 185.0
              },
              "unit": "g",
              "note": null
            }
          ]
        }
      ],
      "fixed": [
        {
          "foodKey": "cenoura_cozida",
          "label": "Legume (cenoura, beterraba, brócolis, abobrinha ou cabotiá)",
          "scalable": false,
          "baseQtyG": {
            "treino": 100.0,
            "descanso": 100.0
          },
          "unit": "g",
          "note": null
        },
        {
          "foodKey": null,
          "label": "Salada de folhas verdes à vontade",
          "scalable": false,
          "baseQtyG": null,
          "unit": null,
          "note": null
        },
        {
          "foodKey": "azeite_oliva",
          "label": "Azeite de oliva",
          "scalable": false,
          "baseQtyG": {
            "treino": 3.0,
            "descanso": 3.0
          },
          "unit": "ml",
          "note": null
        },
        {
          "foodKey": null,
          "label": "Ômega 3",
          "scalable": false,
          "baseQtyG": {
            "treino": 1.0,
            "descanso": 1.0
          },
          "unit": "dose",
          "note": null
        },
        {
          "foodKey": null,
          "label": "Creatina",
          "scalable": false,
          "baseQtyG": {
            "treino": 5.0,
            "descanso": 5.0
          },
          "unit": "g",
          "note": null
        }
      ]
    }
  ],
  "fruits": [
    {
      "foodKey": "morango",
      "label": "Morango",
      "qtyG": 300.0
    },
    {
      "foodKey": "maca",
      "label": "Maçã",
      "qtyG": 150.0
    },
    {
      "foodKey": "pera",
      "label": "Pêra",
      "qtyG": 150.0
    },
    {
      "foodKey": "maracuja",
      "label": "Maracujá",
      "qtyG": 100.0
    },
    {
      "foodKey": "mamao_papaia",
      "label": "Mamão papaia",
      "qtyG": 180.0
    },
    {
      "foodKey": "melao",
      "label": "Melão",
      "qtyG": 270.0
    },
    {
      "foodKey": "banana",
      "label": "Banana",
      "qtyG": 100.0
    },
    {
      "foodKey": "uva_branca",
      "label": "Uva branca",
      "qtyG": 130.0
    },
    {
      "foodKey": "uva_roxa",
      "label": "Uva roxa",
      "qtyG": 130.0
    }
  ],
  "nuts": [
    {
      "foodKey": "amendoas",
      "label": "Amêndoas",
      "qtyG": 20.0
    },
    {
      "foodKey": "castanha_para",
      "label": "Castanha-do-Pará",
      "qtyG": 15.0
    },
    {
      "foodKey": "castanha_caju",
      "label": "Castanha de caju",
      "qtyG": 20.0
    },
    {
      "foodKey": "nozes",
      "label": "Nozes",
      "qtyG": 15.0
    }
  ]
} as const;
