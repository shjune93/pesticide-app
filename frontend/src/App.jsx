import React, { useEffect, useState, useRef, useMemo } from "react";

// 한글 포함 검색 헬퍼
function hangulIncludes(word, input) {
  return word.includes(input);
}

export default function App() {
  // 상태: 작물 관련
  const [cropOptions, setCropOptions] = useState([]);
  const [selectedCrop, setSelectedCrop] = useState("");
  const [filteredCropOptions, setFilteredCropOptions] = useState([]);
  const [showCropSuggestions, setShowCropSuggestions] = useState(false);

  // 상태: 병해충 관련
  const [diseases, setDiseases] = useState([]);
  const [selectedDiseases, setSelectedDiseases] = useState([]);
  const [diseaseSearch, setDiseaseSearch] = useState("");

  // 상태: 기작(제외기작)
  const [mechanismOptions, setMechanismOptions] = useState([]);
  const [excludedMechanisms, setExcludedMechanisms] = useState([]);
  const [mechanismSearch, setMechanismSearch] = useState("");
  const [showMechanismSuggestions, setShowMechanismSuggestions] = useState(false);

  // 상태: 보유 농약
  const [productOptions, setProductOptions] = useState([]);
  const [ownedProducts, setOwnedProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");

  // 추천 결과
  const [recommendations, setRecommendations] = useState([]);

  // 상세 필터 상태
  const [selectedRecTypes, setSelectedRecTypes] = useState([]);
  const [selectedRecMechanisms, setSelectedRecMechanisms] = useState([]);

  // 로딩 상태
  const [isLoading, setIsLoading] = useState(false);

  const cropInputRef = useRef(null);

  // 작물, 기작, 농약 목록 fetch
  useEffect(() => {
    fetch("http://localhost:8000/crops")
      .then(res => res.json())
      .then(data => setCropOptions(data.crops || []));

    fetch("http://localhost:8000/mechanisms")
      .then(res => res.json())
      .then(data => {
        const separated = data.mechanisms.flatMap(m =>
          m.split("+").map(s => s.trim())
        );
        setMechanismOptions(Array.from(new Set(separated)).sort());
      });

    fetch("http://localhost:8000/products")
      .then(res => res.json())
      .then(data => setProductOptions(data.products || []));
  }, []);

  // 작물 선택시 병해충 fetch
  useEffect(() => {
    if (selectedCrop) {
      fetch(`http://localhost:8000/pests?crop=${encodeURIComponent(selectedCrop)}`)
        .then(res => res.json())
        .then(data => setDiseases(data.pests || []));
    }
  }, [selectedCrop]);

  // 작물 입력
  const handleCropInput = e => {
    const value = e.target.value;
    setSelectedCrop(value);
    setFilteredCropOptions(cropOptions.filter(crop =>
      hangulIncludes(crop, value)
    ));
    setShowCropSuggestions(true);
  };

  // 작물 선택
  const handleCropSelect = crop => {
    setSelectedCrop(crop);
    setShowCropSuggestions(false);
    setSelectedDiseases([]);
  };

  // 병해충 선택/해제
  const handleDiseaseToggle = disease => {
    setSelectedDiseases(prev =>
      prev.includes(disease)
        ? prev.filter(d => d !== disease)
        : [...prev, disease]
    );
  };

  // 기작(제외) 토글
  const toggleExcludedMechanism = mech => {
    setExcludedMechanisms(prev =>
      prev.includes(mech)
        ? prev.filter(m => m !== mech)
        : [...prev, mech]
    );
  };

  // 보유 농약 토글
  const toggleOwnedProduct = product => {
    setOwnedProducts(prev =>
      prev.includes(product)
        ? prev.filter(p => p !== product)
        : [...prev, product]
    );
  };

  // 추천 API 호출
  const handleRecommend = async () => {
    setIsLoading(true);
    setRecommendations([]);
    setSelectedRecTypes([]);
    setSelectedRecMechanisms([]);
    try {
      const res = await fetch("http://localhost:8000/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crop: selectedCrop,
          pests_or_diseases: selectedDiseases,
          used_mechanisms: excludedMechanisms,
          owned_products: ownedProducts,
        }),
      });
      const data = await res.json();
      setRecommendations(data.recommendations || []);
    } finally {
      setIsLoading(false);
    }
  };

  // 필터링
  const filteredDiseases = diseases.filter(d =>
    d.toLowerCase().includes(diseaseSearch.toLowerCase())
  );
  const filteredMechanisms = mechanismOptions.filter(m =>
    m.toLowerCase().includes(mechanismSearch.toLowerCase())
  );
  const filteredProducts = productOptions.filter(p =>
    p.toLowerCase().includes(productSearch.toLowerCase())
  );

  // 상세 필터: 제형/기작 필터
  const displayedRecs = useMemo(() => {
    return recommendations.filter(pair => {
      // 제형 필터(AND): 모든 아이템이 type 조건 만족
      const typeOk = pair.every(item =>
        selectedRecTypes.length === 0 || selectedRecTypes.includes(item.type)
      );
      // 기작 필터(AND): pair의 모든 기작에 대해 체크된 기작 모두 포함
      const allPairMechs = pair.map(item => item.mechanism);
      const mechOk =
        selectedRecMechanisms.length === 0 ||
        selectedRecMechanisms.every(mech => allPairMechs.includes(mech));
      return typeOk && mechOk;
    });
  }, [recommendations, selectedRecTypes, selectedRecMechanisms]);

  const recTypes = Array.from(new Set(recommendations.flat().map(item => item.type)));
  const recMechs = Array.from(new Set(recommendations.flat().map(item => item.mechanism)));

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "1rem" }}>농약 추천 시스템</h1>
      {/* 작물 입력 부 */}
      <div style={{ position: "relative", width: "300px" }}>
        <label>작물 선택:</label>
        <input
          type="text"
          value={selectedCrop}
          onChange={handleCropInput}
          onFocus={() => setShowCropSuggestions(true)}
          onBlur={() => setTimeout(() => setShowCropSuggestions(false), 200)}
          ref={cropInputRef}
          style={{ width: "100%", padding: "0.5rem" }}
        />
        {showCropSuggestions && filteredCropOptions.length > 0 && (
          <ul style={{
            listStyle: "none", margin: 0, padding: "0.5rem",
            border: "1px solid #ccc", background: "white",
            position: "absolute", top: "100%", left: 0, right: 0,
            zIndex: 1000, maxHeight: "200px", overflowY: "auto"
          }}>
            {filteredCropOptions.map(crop => (
              <li
                key={crop}
                onMouseDown={() => handleCropSelect(crop)}
                style={{ padding: "0.25rem 0", cursor: "pointer" }}
              >
                {crop}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 병해충 입력 부 */}
      {diseases.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <label>병/충 검색:</label>
          <input
            type="text"
            value={diseaseSearch}
            onChange={e => setDiseaseSearch(e.target.value)}
            placeholder="병해충명을 입력하세요"
            style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem" }}
          />
          <div>
            병/충 선택:
            {filteredDiseases.map(d => (
              <div key={d}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedDiseases.includes(d)}
                    onChange={() => handleDiseaseToggle(d)}
                  />
                  {" " + d}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 작용기작 입력 부 */}
      {mechanismOptions.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <label>작용기작 검색:</label>
          <input
            type="text"
            value={mechanismSearch}
            onChange={e => {
              setMechanismSearch(e.target.value);
              setShowMechanismSuggestions(true);
            }}
            onFocus={() => setShowMechanismSuggestions(true)}
            onBlur={() => setTimeout(() => setShowMechanismSuggestions(false), 200)}
            placeholder="기작명을 입력하세요"
            style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem" }}
          />
          {showMechanismSuggestions && (
            <div style={{
              maxHeight: "200px", overflowY: "auto",
              border: "1px solid #ccc", padding: "0.5rem"
            }}>
              {filteredMechanisms.map(m => (
                <div key={m}>
                  <label>
                    <input
                      type="checkbox"
                      checked={excludedMechanisms.includes(m)}
                      onChange={() => toggleExcludedMechanism(m)}
                    />
                    {" " + m}
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 보유 농약 입력 부 */}
      {productOptions.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <label>보유 농약 검색:</label>
          <input
            type="text"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            placeholder="보유 농약명을 입력하세요"
            style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem" }}
          />
          <div style={{
            maxHeight: "200px", overflowY: "auto",
            border: "1px solid #ccc", padding: "0.5rem"
          }}>
            {filteredProducts.map(p => (
              <div key={p}>
                <label>
                  <input
                    type="checkbox"
                    checked={ownedProducts.includes(p)}
                    onChange={() => toggleOwnedProduct(p)}
                  />
                  {" " + p}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 추천 버튼 */}
      <button onClick={handleRecommend} style={{ marginTop: "1rem" }}>
        추천받기
      </button>

      {/* 추천 중 로딩 표시 */}
      {isLoading && <p style={{ marginTop: "1rem", fontStyle: "italic" }}>추천받는 중...</p>}

      {/* 상세 필터 UI */}
      {recommendations.length > 0 && (
        <div style={{
          marginTop: "2rem", border: "1px solid #ccc",
          padding: "1rem", borderRadius: "4px"
        }}>
          <h3>추천 결과 필터</h3>
          <div>
            <strong>제형 필터:</strong>
            {recTypes.map(type => (
              <label key={type} style={{ marginLeft: "1rem" }}>
                <input
                  type="checkbox"
                  checked={selectedRecTypes.includes(type)}
                  onChange={() =>
                    setSelectedRecTypes(prev =>
                      prev.includes(type)
                        ? prev.filter(t => t !== type)
                        : [...prev, type]
                    )
                  }
                />
                {" " + type}
              </label>
            ))}
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <strong>기작번호 필터:</strong>
            {recMechs.map(mech => (
              <label key={mech} style={{ marginLeft: "1rem" }}>
                <input
                  type="checkbox"
                  checked={selectedRecMechanisms.includes(mech)}
                  onChange={() =>
                    setSelectedRecMechanisms(prev =>
                      prev.includes(mech)
                        ? prev.filter(m => m !== mech)
                        : [...prev, mech]
                    )
                  }
                />
                {" " + mech}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 결과 출력 */}
      {isLoading ? null : (
        displayedRecs.length > 0 ? (
          <div style={{ marginTop: "2rem" }}>
            <h2>추천 농약 조합</h2>
            {displayedRecs.map((pair, idx) => (
              <div key={idx} style={{
                border: "1px solid #ccc", padding: "1rem",
                marginBottom: "1rem", borderRadius: "4px"
              }}>
                <h3>조합 {idx + 1}</h3>
                {pair.map((r, i) => (
                  <div key={i} style={{ marginBottom: "1rem" }}>
                    <div><strong>상표명:</strong> {r.product}</div>
                    <div><strong>기작번호:</strong> {r.mechanism}</div>
                    <div><strong>기작명:</strong> {r.mechanism_name}</div>
                    <div><strong>작용부위:</strong> {r.site_of_action}</div>
                    <div><strong>작용원리:</strong> {r.mode_of_action}</div>
                    <div><strong>제형:</strong> {r.type}</div>
                    <div><strong>적용 병해충:</strong> {(r.pests||[]).join(", ")}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          recommendations.length === 0 && (
            <p style={{ marginTop: "1rem" }}>조건에 맞는 추천이 없습니다.</p>
          )
        )
      )}
    </div>
  );
}
