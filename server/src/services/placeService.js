// D:\QUAN LY KHACH SAN\server\src\services\placeService.js
const axios = require('axios');
const dotenv = require('dotenv'); // Cần để đọc .env nếu bạn muốn tách cấu hình

// Load biến môi trường (Chỉ cần nếu bạn chưa load ở index.js)
// dotenv.config(); 

// ✅ Cấu hình Overpass API và Tọa độ Khách sạn Cố định
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
// Ví dụ: Tọa độ trung tâm Cần Thơ. Bạn cần thay bằng tọa độ khách sạn của mình.
const HOTEL_LAT = 10.02977;
const HOTEL_LNG = 105.7704766;
const KM_TO_METERS = 1000;

// Hàm ánh xạ đơn giản (bạn cần mở rộng để phù hợp với các truy vấn khác)
function mapVietnameseToPlaceType(vietnameseKeyword) {
    const mapping = {
        'nhà hàng': 'restaurant',
        'quán ăn': 'restaurant',
        'quán cà phê': 'cafe',
        'siêu thị': 'supermarket',
        'bệnh viện': 'hospital',
        'atm': 'atm',
        'tiệm quà tặng':'gift'
    };
    const lowerCaseKeyword = vietnameseKeyword.toLowerCase();

    return mapping[lowerCaseKeyword] || 'point_of_interest';
}

/**
 * Xây dựng truy vấn Overpass QL để tìm các điểm quan tâm lân cận.
 * @param {string} placeType - Loại địa điểm (đã ánh xạ).
 * @param {number} radiusMeters - Bán kính tìm kiếm (mét).
 * @returns {string} Chuỗi truy vấn Overpass QL.
 */
function buildOverpassQuery(placeType, radiusMeters) {
    // Overpass sử dụng các "tags" (cặp key=value) để phân loại
    let tagKey = 'amenity';
    let tagValue = placeType;

    // Ánh xạ lại một số tag cụ thể hơn cho OSM
    if (placeType === 'supermarket') {
        tagKey = 'shop';
        tagValue = 'supermarket';
        shop = 'supermarket'
    } else if (placeType === 'hospital') {
        tagKey = 'amenity';
        tagValue = 'hospital';
    }
    // ... thêm các tag khác nếu cần

    const query = `
[out:json][timeout:25];
// Tìm kiếm node (điểm) và way (đường/khu vực) trong bán kính
(
  node[${tagKey}="${tagValue}"](around:${radiusMeters}, ${HOTEL_LAT}, ${HOTEL_LNG});
  way[${tagKey}="${tagValue}"](around:${radiusMeters}, ${HOTEL_LAT}, ${HOTEL_LNG});
);
out center;
`;
    return query;
}

/**
 * Tìm kiếm các địa điểm lân cận sử dụng Overpass API.
 * @param {string} placeType - Loại địa điểm (tiếng Việt).
 * @param {number} maxDistanceKm - Khoảng cách tối đa (km).
 * @returns {Promise<Array<Object>>} Danh sách các địa điểm.
 */

// D:\QUAN LY KHACH SAN\server\src\services\placeService.js

// Bán kính Trái Đất trung bình (Kilometers)
const EARTH_RADIUS_KM = 6371;

/**
 * Tính khoảng cách (km) giữa hai tọa độ (latitude, longitude) bằng công thức Haversine.
 * @param {number} lat1 - Vĩ độ điểm 1.
 * @param {number} lon1 - Kinh độ điểm 1.
 * @param {number} lat2 - Vĩ độ điểm 2.
 * @param {number} lon2 - Kinh độ điểm 2.
 * @returns {number} Khoảng cách tính bằng Kilometers.
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    // Hàm chuyển đổi độ sang radian
    const toRad = (value) => (value * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Khoảng cách (km)
    return EARTH_RADIUS_KM * c;
}

async function searchNearbyPlaces(placeType, maxDistanceKm = 1) {
    const radiusMeters = maxDistanceKm * KM_TO_METERS;
    const mappedType = mapVietnameseToPlaceType(placeType);
    const query = buildOverpassQuery(mappedType, radiusMeters);

    console.log(`🔍 Gọi Overpass API cho: ${mappedType}, bán kính: ${maxDistanceKm}km`);

    try {
        const response = await axios.post(OVERPASS_API_URL, `data=${encodeURIComponent(query)}`, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 20000 // Tăng timeout cho API bên ngoài
        });
        const data = response.data;

        if (!data || !data.elements || data.elements.length === 0) {
            return [];
        }

        // --- Chuẩn hóa kết quả ---
        const normalizedPlaces = data.elements.map(element => {
            // Lấy tọa độ trung tâm cho Way hoặc Node
            const lat = element.lat || (element.center ? element.center.lat : null);
            const lon = element.lon || (element.center ? element.center.lon : null);
            let distanceKm = null;
            if (lat && lon) {
                distanceKm = calculateDistance(HOTEL_LAT, HOTEL_LNG, lat, lon);
            }
            // Tên địa điểm thường nằm trong tags.name
            const mappedType = mapVietnameseToPlaceType(placeType);
            const name = element.tags.name || element.tags.amenity || `Địa điểm ${mappedType}`;
            const address = element.tags['addr:full'] || element.tags['addr:street'] || element.tags['addr:district'] || element.tags['addr:city'] || "Địa chỉ không xác định";
            // const fallbackAddress = (lat && lon) ? `Tọa độ: ${lat.toFixed(6)}, ${lon.toFixed(6)}` : "Địa chỉ không xác định";

            return {
                name,
                address: address,
                // Có thể tính toán khoảng cách nếu cần (dùng tọa độ lat, lon)
                distanceKm: distanceKm
            };
        });
        normalizedPlaces.sort((a, b) => {
            // Đảm bảo các phần tử có khoảng cách (không null) được sắp xếp trước
            if (a.distanceKm === null) return 1;
            if (b.distanceKm === null) return -1;
            return a.distanceKm - b.distanceKm; // Sắp xếp từ nhỏ nhất đến lớn nhất
        });

        // --- BƯỚC 3: Giới hạn Kết quả và Định dạng cuối cùng ---
        // ✅ Giới hạn 5 địa điểm gần nhất (có thể thay đổi 5 tùy ý)
        const FINAL_LIMIT = 5;

        return normalizedPlaces.slice(0, FINAL_LIMIT).map(p => ({
            name: p.name,
            address: p.address,
            // Định dạng lại thành chuỗi hiển thị
            distance: p.distanceKm ? `${p.distanceKm.toFixed(2)} km` : "Không rõ"
        }));

    } catch (error) {
        // Overpass thường trả về 429 nếu bị rate limit
        console.error("❌ Lỗi kết nối Overpass API:", error.message);
        return [];
    }
}

module.exports = {
    searchNearbyPlaces,
};