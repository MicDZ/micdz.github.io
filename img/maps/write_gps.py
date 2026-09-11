import piexif
from PIL import Image

def change_to_rational(number):
    """将浮点数转换为 (分子, 分母) 的形式"""
    f_number = abs(number)
    d = int(f_number)
    m = int((f_number - d) * 60)
    s = int((f_number - d - m/60) * 3600 * 100)
    return ((d, 1), (m, 1), (s, 100))

def set_gps_location(file_path, lat, lng):
    """
    向图片写入 GPS 信息
    :param file_path: 图片路径
    :param lat: 纬度 (负数为南纬)
    :param lng: 经度 (负数为西经)
    """
    # 1. 转换坐标格式
    lat_deg = change_to_rational(lat)
    lng_deg = change_to_rational(lng)

    # 2. 判断方向
    lat_ref = 'N' if lat >= 0 else 'S'
    lng_ref = 'E' if lng >= 0 else 'W'

    # 3. 构建 GPS 字典
    gps_ifd = {
        piexif.GPSIFD.GPSLatitudeRef: lat_ref,
        piexif.GPSIFD.GPSLatitude: lat_deg,
        piexif.GPSIFD.GPSLongitudeRef: lng_ref,
        piexif.GPSIFD.GPSLongitude: lng_deg,
    }

    # 4. 读取现有 EXIF 并插入新 GPS 数据
    try:
        exif_dict = piexif.load(file_path)
        exif_dict["GPS"] = gps_ifd
        exif_bytes = piexif.dump(exif_dict)
        
        # 5. 写回图片 (保持原图质量)
        piexif.insert(exif_bytes, file_path)
        print(f"成功写入 GPS 信息到: {file_path}")
    except Exception as e:
        print(f"处理失败: {e}")

# --- 使用示例 ---
if __name__ == "__main__":
    # 示例坐标：天安门 (39.9087, 116.3975)
    target_image = "/Users/micdz/Downloads/IMG_9392.JPG" 
    set_gps_location(target_image, 29.63915, 95.06521)