export class ComboViewDto {
  title: string;       // Map từ combo.name
  description: string; // Bản dịch chi tiết combo
  price: string;       // Định dạng sẵn dạng chuỗi (Ví dụ: "250.000đ")
  iconKey: string;     // Dùng để map bộ Icon ở React (Classic, Gentleman, Royal, Relax)
  duration: number;    //Thời gian sử dụng dịch vụ
}