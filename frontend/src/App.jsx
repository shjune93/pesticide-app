import React, { useEffect, useState, useRef, useMemo } from "react";

function hangulIncludes(word, input) {
  return word.includes(input);
}

export default function App() {
  const [cropOptions, setCropOptions] = useState([]);
  const [selectedCrop, setSelectedCrop] = useState("");
  const [filteredCropOptions, setFilteredCropOptions] = useState([]);
  const [showCropSuggestions, setShowCropSuggestions] = useState(false);

  const [diseases, setDiseases] = useState([]);
  const [selectedDiseases, setSelectedDiseases] = useState([]);
  const [diseaseSearch, setDiseaseSearch] = useState("");

  const [mechanismOptions, setMechanismOptions] = useState([]);
  const [excludedMechanisms, setExcludedMechanisms] = useState([]);
  const [mechanismSearch, setMechanismSearch] = useState("");
  const [showMechanismSuggestions, setShowMechanismSuggestions] = useState(false);

  const [productOptions, setProductOptions] = useState([]);
  const [ownedProducts, setOwnedProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");

  const [recommendations, setRecommendations] = useState([]);

  // ← 수정된 부분: 상세 필터용 상태 추가
  const [selectedRecTypes, setSelectedRecTypes] = useState([]);
  const [selectedRecMechanisms, setSelectedRecMechanisms] = useState([]);

  const cropInputRef = useRef(null);

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

  useEffect(() => {
    if (selectedCrop) {
      fetch(`http://localhost:8000/pests?crop=${encodeURIComponent(selectedCrop)}`)
        .then(res => res.json())
        .then(data => setDiseases(data.pests || []));
    }
  }, [selectedCrop]);

  const handleCropInput = e => {
    const value = e.target.value;
    setSelectedCrop(value);
    setFilteredCropOptions(cropOptions.filter(crop =>
      hangulIncludes(crop, value)
    ));
    setShowCropSuggestions(true);
  };

  const handleCropSelect = crop => {
    setSelectedCrop(crop);
    setShowCropSuggestions(false);
    setSelectedDiseases([]);
  };

  const handleDiseaseToggle = disease => {
    setSelectedDiseases(prev =>
      prev.includes(disease)
        ? prev.filter(d => d !== disease)
        : [...prev, disease]
    );
  };

  const toggleExcludedMechanism = mech => {
    setExcludedMechanisms(prev =>
      prev.includes(mech)
        ? prev.filter(m => m !== mech)
        : [...prev, mech]
    );
  };

  const toggleOwnedProduct = product => {
    setOwnedProducts(prev =>
      prev.includes(product)
        ? prev.filter(p => p !== product)
        : [...prev, product]
    );
  };

  const handleRecommend = async () => {
    setRecommendations([]); // 이전 추천 초기화
    setSelectedRecTypes([]); // ← 수정된 부분: 상세 필터 초기화
    setSelectedRecMechanisms([]); // ← 수정된 부분
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
  };

  const filteredDiseases = diseases.filter(d =>
    d.toLowerCase().includes(diseaseSearch.toLowerCase())
  );
  const filteredMechanisms = mechanismOptions.filter(m =>
    m.toLowerCase().includes(mechanismSearch.toLowerCase())
  );
  const filteredProducts = productOptions.filter(p =>
    p.toLowerCase().includes(productSearch.toLowerCase())
  );

  // ← 수정된 부분: 필터 조건 적용된 추천 목록 계산
  const displayedRecs = useMemo(() => {
    return recommendations.filter(pair =>
      pair.every(item =>
        (selectedRecTypes.length === 0 || selectedRecTypes.includes(item.type)) &&
        (selectedRecMechanisms.length === 0 || selectedRecMechanisms.includes(item.mechanism))
      )
    );
  }, [recommendations, selectedRecTypes, selectedRecMechanisms]);

  // ← 수정된 부분: UI용 필터 옵션 생성
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

      {/* 질병/해충 입력부 */}
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

      {/* 작용기작 입력부 */}
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

      {/* 보유 농약 입력부 */}
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

      {/* ← 수정된 부분: 상세 필터 UI */}
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
      {displayedRecs.length > 0 ? (
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
                  <div><strong>성분:</strong> {r.ingredient}</div>
                  <div><strong>제형:</strong> {r.type}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        recommendations.length > 0 && (
          <p style={{ marginTop: "1rem" }}>조건에 맞는 추천이 없습니다.</p>
        )
      )}
    </div>
  );
}
