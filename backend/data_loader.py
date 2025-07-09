import pandas as pd

# 엑셀 파일 경로
PRODUCT_FILE = "data/20250705_농약제품 목록.xlsx"
MECHANISM_FILE = "data/농약조합 표 및 작용기작.xlsx"

# 데이터프레임 로딩
product_df = pd.read_excel(PRODUCT_FILE)
mechanism_df = pd.read_excel(MECHANISM_FILE, sheet_name="작용기작 구체적인 경로")

# 기작번호별 설명 매핑
mechanism_map = {}
for _, row in mechanism_df.iterrows():
    key = str(row["작용기작 번호"]).strip()
    mechanism_map[key] = {
        "explanation": str(row.get("해충에 대한 작용 원리", "")),
        "ingredient": str(row.get("대표 성분 예시", ""))
    }

def get_crop_list():
    crops = product_df["작물명"].dropna().unique().tolist()
    return sorted(crops)

def recommend_pesticides(crop: str, pests: list[str], used_mechanisms: list[str]):
    filtered = product_df[
        (product_df["작물명"] == crop) &
        (product_df["병해충명"].isin(pests)) &
        (~product_df["기작번호"].isin(used_mechanisms))
    ]

    recommendations = []
    for _, row in filtered.head(2).iterrows():
        mech = str(row["기작번호"]).strip()
        mech_info = mechanism_map.get(mech, {})
        recommendations.append({
            "product": row["농약명"],
            "mechanism": mech,
            "explanation": mech_info.get("explanation", ""),
            "ingredient": mech_info.get("ingredient", "")
        })
    return recommendations