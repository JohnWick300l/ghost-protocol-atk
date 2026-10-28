import { type PlaceSuggestion, searchAndRankPlaces } from './rules.ts';

export interface IndiaTownEntry {
  name: string;
  state: string;
  district?: string;
  lat: number;
  lng: number;
  aliases?: string[];
  category?: string;
}

/**
 * Comprehensive directory of Indian cities, district headquarters, taluks, and local towns
 * across all States and Union Territories of India.
 * Used alongside live OpenStreetMap Nominatim & Photon geocoding for instant Google Maps-style search.
 */
export const ALL_INDIA_CITIES_AND_TOWNS: IndiaTownEntry[] = [
  // KARNATAKA (All districts & major taluks/towns)
  { name: 'Bengaluru', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9716, lng: 77.5946, aliases: ['Bangalore', 'BLR'] },
  { name: 'Mysuru', state: 'Karnataka', district: 'Mysuru', lat: 12.2958, lng: 76.6394, aliases: ['Mysore'] },
  { name: 'Mangaluru', state: 'Karnataka', district: 'Dakshina Kannada', lat: 12.9141, lng: 74.8560, aliases: ['Mangalore'] },
  { name: 'Hubballi', state: 'Karnataka', district: 'Dharwad', lat: 15.3647, lng: 75.1240, aliases: ['Hubli', 'Hubli-Dharwad'] },
  { name: 'Dharwad', state: 'Karnataka', district: 'Dharwad', lat: 15.4589, lng: 75.0078 },
  { name: 'Belagavi', state: 'Karnataka', district: 'Belagavi', lat: 15.8497, lng: 74.4977, aliases: ['Belgaum'] },
  { name: 'Kalaburagi', state: 'Karnataka', district: 'Kalaburagi', lat: 17.3297, lng: 76.8343, aliases: ['Gulbarga'] },
  { name: 'Davanagere', state: 'Karnataka', district: 'Davanagere', lat: 14.4644, lng: 75.9218, aliases: ['Davangere'] },
  { name: 'Ballari', state: 'Karnataka', district: 'Ballari', lat: 15.1394, lng: 76.9214, aliases: ['Bellary'] },
  { name: 'Vijayapura', state: 'Karnataka', district: 'Vijayapura', lat: 16.8302, lng: 75.7100, aliases: ['Bijapur'] },
  { name: 'Shivamogga', state: 'Karnataka', district: 'Shivamogga', lat: 13.9299, lng: 75.5681, aliases: ['Shimoga'] },
  { name: 'Tumakuru', state: 'Karnataka', district: 'Tumakuru', lat: 13.3379, lng: 77.1173, aliases: ['Tumkur'] },
  { name: 'Raichur', state: 'Karnataka', district: 'Raichur', lat: 16.2076, lng: 77.3463 },
  { name: 'Bidar', state: 'Karnataka', district: 'Bidar', lat: 17.9104, lng: 77.5199 },
  { name: 'Hospet', state: 'Karnataka', district: 'Vijayanagara', lat: 15.2689, lng: 76.3909, aliases: ['Hosapete', 'Hampi'] },
  { name: 'Gadag-Betageri', state: 'Karnataka', district: 'Gadag', lat: 15.4315, lng: 75.6355, aliases: ['Gadag'] },
  { name: 'Robertsonpet', state: 'Karnataka', district: 'Kolar', lat: 12.9585, lng: 78.2714, aliases: ['KGF', 'Kolar Gold Fields'] },
  { name: 'Hassan', state: 'Karnataka', district: 'Hassan', lat: 13.0033, lng: 76.1004 },
  { name: 'Bhadravati', state: 'Karnataka', district: 'Shivamogga', lat: 13.8400, lng: 75.7050 },
  { name: 'Chitradurga', state: 'Karnataka', district: 'Chitradurga', lat: 14.2251, lng: 76.3980 },
  { name: 'Udupi', state: 'Karnataka', district: 'Udupi', lat: 13.3409, lng: 74.7421 },
  { name: 'Manipal', state: 'Karnataka', district: 'Udupi', lat: 13.3525, lng: 74.7868 },
  { name: 'Kolar', state: 'Karnataka', district: 'Kolar', lat: 13.1362, lng: 78.1291 },
  { name: 'Mandya', state: 'Karnataka', district: 'Mandya', lat: 12.5218, lng: 76.8951 },
  { name: 'Chikkamagaluru', state: 'Karnataka', district: 'Chikkamagaluru', lat: 13.3161, lng: 75.7720, aliases: ['Chikmagalur'] },
  { name: 'Gangawati', state: 'Karnataka', district: 'Koppal', lat: 15.4319, lng: 76.5281 },
  { name: 'Bagalkot', state: 'Karnataka', district: 'Bagalkot', lat: 16.1691, lng: 75.6615, aliases: ['Bagalkote'] },
  { name: 'Ranebennuru', state: 'Karnataka', district: 'Haveri', lat: 14.6195, lng: 75.6217, aliases: ['Ranebennur'] },
  { name: 'Haveri', state: 'Karnataka', district: 'Haveri', lat: 14.7951, lng: 75.3991 },
  { name: 'Koppal', state: 'Karnataka', district: 'Koppal', lat: 15.3505, lng: 76.1567 },
  { name: 'Chikkaballapur', state: 'Karnataka', district: 'Chikkaballapur', lat: 13.4355, lng: 77.7315, aliases: ['Chickballapur'] },
  { name: 'Ramanagara', state: 'Karnataka', district: 'Ramanagara', lat: 12.7209, lng: 77.2799 },
  { name: 'Channapatna', state: 'Karnataka', district: 'Ramanagara', lat: 12.6518, lng: 77.2067 },
  { name: 'Maddur', state: 'Karnataka', district: 'Mandya', lat: 12.5841, lng: 77.0428 },
  { name: 'Kanakapura', state: 'Karnataka', district: 'Ramanagara', lat: 12.5462, lng: 77.4199 },
  { name: 'Doddaballapura', state: 'Karnataka', district: 'Bengaluru Rural', lat: 13.2927, lng: 77.5389 },
  { name: 'Devanahalli', state: 'Karnataka', district: 'Bengaluru Rural', lat: 13.2466, lng: 77.7118 },
  { name: 'Hoskote', state: 'Karnataka', district: 'Bengaluru Rural', lat: 13.0707, lng: 77.7981 },
  { name: 'Nelamangala', state: 'Karnataka', district: 'Bengaluru Rural', lat: 13.0993, lng: 77.3936 },
  { name: 'Anekal', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.7111, lng: 77.6956 },
  { name: 'Attibele', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.7785, lng: 77.7713 },
  { name: 'Whitefield', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9698, lng: 77.7500 },
  { name: 'Shivajinagar', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9857, lng: 77.6057, aliases: ['Shivaji Nagar'] },
  { name: 'Electronic City', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.8452, lng: 77.6602 },
  { name: 'Yelahanka', state: 'Karnataka', district: 'Bengaluru Urban', lat: 13.1007, lng: 77.5963 },
  { name: 'Indiranagar', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9719, lng: 77.6412 },
  { name: 'Koramangala', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9352, lng: 77.6245 },
  { name: 'Jayanagar', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9308, lng: 77.5838 },
  { name: 'HSR Layout', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9121, lng: 77.6446 },
  { name: 'Malleswaram', state: 'Karnataka', district: 'Bengaluru Urban', lat: 13.0035, lng: 77.5643, aliases: ['Malleshwaram'] },
  { name: 'Rajajinagar', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9982, lng: 77.5530 },
  { name: 'Marathahalli', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9592, lng: 77.6974 },
  { name: 'Bellandur', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9304, lng: 77.6784 },
  { name: 'Hebbal', state: 'Karnataka', district: 'Bengaluru Urban', lat: 13.0358, lng: 77.5970 },
  { name: 'JP Nagar', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9063, lng: 77.5857 },
  { name: 'Banashankari', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9255, lng: 77.5468 },
  { name: 'BTM Layout', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9166, lng: 77.6101 },
  { name: 'MG Road', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9756, lng: 77.6066 },
  { name: 'Sarjapur', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.8615, lng: 77.7859 },
  { name: 'KR Puram', state: 'Karnataka', district: 'Bengaluru Urban', lat: 13.0040, lng: 77.6879, aliases: ['Krishnarajapuram'] },
  { name: 'Kengeri', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9177, lng: 77.4833 },
  { name: 'Vijayanagar', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9719, lng: 77.5327 },
  { name: 'Basavanagudi', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9406, lng: 77.5738 },
  { name: 'Bandra', state: 'Maharashtra', district: 'Mumbai', lat: 19.0596, lng: 72.8295 },
  { name: 'Andheri', state: 'Maharashtra', district: 'Mumbai', lat: 19.1136, lng: 72.8697 },
  { name: 'Powai', state: 'Maharashtra', district: 'Mumbai', lat: 19.1176, lng: 72.9060 },
  { name: 'Kothrud', state: 'Maharashtra', district: 'Pune', lat: 18.5074, lng: 73.8077 },
  { name: 'Hinjewadi', state: 'Maharashtra', district: 'Pune', lat: 18.5913, lng: 73.7389 },
  { name: 'Viman Nagar', state: 'Maharashtra', district: 'Pune', lat: 18.5679, lng: 73.9143 },
  { name: 'Adyar', state: 'Tamil Nadu', district: 'Chennai', lat: 13.0012, lng: 80.2565 },
  { name: 'Anna Nagar', state: 'Tamil Nadu', district: 'Chennai', lat: 13.0850, lng: 80.2101 },
  { name: 'T Nagar', state: 'Tamil Nadu', district: 'Chennai', lat: 13.0418, lng: 80.2341 },
  { name: 'Velachery', state: 'Tamil Nadu', district: 'Chennai', lat: 12.9815, lng: 80.2180 },
  { name: 'Banjara Hills', state: 'Telangana', district: 'Hyderabad', lat: 17.4156, lng: 78.4347 },
  { name: 'Jubilee Hills', state: 'Telangana', district: 'Hyderabad', lat: 17.4326, lng: 78.4071 },
  { name: 'Gachibowli', state: 'Telangana', district: 'Hyderabad', lat: 17.4401, lng: 78.3489 },
  { name: 'Madhapur', state: 'Telangana', district: 'Hyderabad', lat: 17.4486, lng: 78.3908 },
  { name: 'Edappally', state: 'Kerala', district: 'Ernakulam', lat: 10.0261, lng: 76.3125 },
  { name: 'Kakkanad', state: 'Kerala', district: 'Ernakulam', lat: 10.0159, lng: 76.3419 },
  { name: 'Madikeri', state: 'Karnataka', district: 'Kodagu', lat: 12.4244, lng: 75.7382, aliases: ['Coorg'] },
  { name: 'Kushalnagar', state: 'Karnataka', district: 'Kodagu', lat: 12.4593, lng: 75.9598 },
  { name: 'Virajpet', state: 'Karnataka', district: 'Kodagu', lat: 12.1977, lng: 75.8035 },
  { name: 'Chamarajanagar', state: 'Karnataka', district: 'Chamarajanagar', lat: 11.9261, lng: 76.9437 },
  { name: 'Nanjangud', state: 'Karnataka', district: 'Mysuru', lat: 12.1200, lng: 76.6801 },
  { name: 'Hunsur', state: 'Karnataka', district: 'Mysuru', lat: 12.3052, lng: 76.2878 },
  { name: 'Srirangapatna', state: 'Karnataka', district: 'Mandya', lat: 12.4237, lng: 76.6829 },
  { name: 'Sakleshpur', state: 'Karnataka', district: 'Hassan', lat: 12.9442, lng: 75.7866 },
  { name: 'Arsikere', state: 'Karnataka', district: 'Hassan', lat: 13.3136, lng: 76.2569 },
  { name: 'Channarayapatna', state: 'Karnataka', district: 'Hassan', lat: 12.9035, lng: 76.3888 },
  { name: 'Belur', state: 'Karnataka', district: 'Hassan', lat: 13.1623, lng: 75.8651 },
  { name: 'Puttur', state: 'Karnataka', district: 'Dakshina Kannada', lat: 12.7687, lng: 75.2034 },
  { name: 'Sullia', state: 'Karnataka', district: 'Dakshina Kannada', lat: 12.5637, lng: 75.3886 },
  { name: 'Bantwal', state: 'Karnataka', district: 'Dakshina Kannada', lat: 12.8913, lng: 75.0347 },
  { name: 'Moodabidri', state: 'Karnataka', district: 'Dakshina Kannada', lat: 13.0689, lng: 74.9936 },
  { name: 'Kundapura', state: 'Karnataka', district: 'Udupi', lat: 13.6267, lng: 74.6914, aliases: ['Kundapur'] },
  { name: 'Karkala', state: 'Karnataka', district: 'Udupi', lat: 13.2151, lng: 74.9962 },
  { name: 'Karwar', state: 'Karnataka', district: 'Uttara Kannada', lat: 14.8185, lng: 74.1290 },
  { name: 'Sirsi', state: 'Karnataka', district: 'Uttara Kannada', lat: 14.6195, lng: 74.8354 },
  { name: 'Dandeli', state: 'Karnataka', district: 'Uttara Kannada', lat: 15.2361, lng: 74.6173 },
  { name: 'Bhatkal', state: 'Karnataka', district: 'Uttara Kannada', lat: 13.9904, lng: 74.5449 },
  { name: 'Kumta', state: 'Karnataka', district: 'Uttara Kannada', lat: 14.4257, lng: 74.4189 },
  { name: 'Gokarna', state: 'Karnataka', district: 'Uttara Kannada', lat: 14.5479, lng: 74.3188 },
  { name: 'Sagar', state: 'Karnataka', district: 'Shivamogga', lat: 14.1670, lng: 75.0403 },
  { name: 'Thirthahalli', state: 'Karnataka', district: 'Shivamogga', lat: 13.6881, lng: 75.2447 },
  { name: 'Tiptur', state: 'Karnataka', district: 'Tumakuru', lat: 13.2571, lng: 76.4785 },
  { name: 'Sira', state: 'Karnataka', district: 'Tumakuru', lat: 13.7411, lng: 76.9042 },
  { name: 'Kunigal', state: 'Karnataka', district: 'Tumakuru', lat: 13.0243, lng: 77.0265 },
  { name: 'Mulbagal', state: 'Karnataka', district: 'Kolar', lat: 13.1645, lng: 78.3932 },
  { name: 'Bangarapet', state: 'Karnataka', district: 'Kolar', lat: 12.9914, lng: 78.1795 },
  { name: 'Malur', state: 'Karnataka', district: 'Kolar', lat: 13.0037, lng: 77.9383 },
  { name: 'Chintamani', state: 'Karnataka', district: 'Chikkaballapur', lat: 13.4020, lng: 78.0551 },
  { name: 'Gauribidanur', state: 'Karnataka', district: 'Chikkaballapur', lat: 13.6114, lng: 77.5170 },
  { name: 'Yadgir', state: 'Karnataka', district: 'Yadgir', lat: 16.7700, lng: 77.1376 },
  { name: 'Gokak', state: 'Karnataka', district: 'Belagavi', lat: 16.1695, lng: 74.8239 },
  { name: 'Chikkodi', state: 'Karnataka', district: 'Belagavi', lat: 16.4310, lng: 74.5877 },

  // TAMIL NADU (All districts & major towns)
  { name: 'Chennai', state: 'Tamil Nadu', district: 'Chennai', lat: 13.0827, lng: 80.2707, aliases: ['Madras'] },
  { name: 'Coimbatore', state: 'Tamil Nadu', district: 'Coimbatore', lat: 11.0168, lng: 76.9558, aliases: ['Kovai'] },
  { name: 'Madurai', state: 'Tamil Nadu', district: 'Madurai', lat: 9.9252, lng: 78.1198 },
  { name: 'Tiruchirappalli', state: 'Tamil Nadu', district: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047, aliases: ['Trichy'] },
  { name: 'Salem', state: 'Tamil Nadu', district: 'Salem', lat: 11.6643, lng: 78.1460 },
  { name: 'Tiruppur', state: 'Tamil Nadu', district: 'Tiruppur', lat: 11.1085, lng: 77.3411, aliases: ['Tirupur'] },
  { name: 'Erode', state: 'Tamil Nadu', district: 'Erode', lat: 11.3410, lng: 77.7172 },
  { name: 'Vellore', state: 'Tamil Nadu', district: 'Vellore', lat: 12.9165, lng: 79.1325 },
  { name: 'Thoothukudi', state: 'Tamil Nadu', district: 'Thoothukudi', lat: 8.7642, lng: 78.1348, aliases: ['Tuticorin'] },
  { name: 'Tirunelveli', state: 'Tamil Nadu', district: 'Tirunelveli', lat: 8.7139, lng: 77.7567 },
  { name: 'Dindigul', state: 'Tamil Nadu', district: 'Dindigul', lat: 10.3673, lng: 77.9803 },
  { name: 'Thanjavur', state: 'Tamil Nadu', district: 'Thanjavur', lat: 10.7870, lng: 79.1378, aliases: ['Tanjore'] },
  { name: 'Hosur', state: 'Tamil Nadu', district: 'Krishnagiri', lat: 12.7409, lng: 77.8253 },
  { name: 'Krishnagiri', state: 'Tamil Nadu', district: 'Krishnagiri', lat: 12.5266, lng: 78.2150 },
  { name: 'Nagercoil', state: 'Tamil Nadu', district: 'Kanyakumari', lat: 8.1833, lng: 77.4119 },
  { name: 'Kanyakumari', state: 'Tamil Nadu', district: 'Kanyakumari', lat: 8.0883, lng: 77.5385 },
  { name: 'Kanchipuram', state: 'Tamil Nadu', district: 'Kanchipuram', lat: 12.8342, lng: 79.7036 },
  { name: 'Sriperumbudur', state: 'Tamil Nadu', district: 'Kanchipuram', lat: 12.9675, lng: 79.9479 },
  { name: 'Chengalpattu', state: 'Tamil Nadu', district: 'Chengalpattu', lat: 12.6819, lng: 79.9888 },
  { name: 'Mahabalipuram', state: 'Tamil Nadu', district: 'Chengalpattu', lat: 12.6208, lng: 80.1945, aliases: ['Mamallapuram'] },
  { name: 'Tambaram', state: 'Tamil Nadu', district: 'Chengalpattu', lat: 12.9249, lng: 80.1000 },
  { name: 'Karur', state: 'Tamil Nadu', district: 'Karur', lat: 10.9601, lng: 78.0766 },
  { name: 'Namakkal', state: 'Tamil Nadu', district: 'Namakkal', lat: 11.2189, lng: 78.1674 },
  { name: 'Dharmapuri', state: 'Tamil Nadu', district: 'Dharmapuri', lat: 12.1211, lng: 78.1582 },
  { name: 'Kumbakonam', state: 'Tamil Nadu', district: 'Thanjavur', lat: 10.9617, lng: 79.3881 },
  { name: 'Cuddalore', state: 'Tamil Nadu', district: 'Cuddalore', lat: 11.7480, lng: 79.7714 },
  { name: 'Chidambaram', state: 'Tamil Nadu', district: 'Cuddalore', lat: 11.3992, lng: 79.6935 },
  { name: 'Villupuram', state: 'Tamil Nadu', district: 'Villupuram', lat: 11.9401, lng: 79.4861 },
  { name: 'Tiruvannamalai', state: 'Tamil Nadu', district: 'Tiruvannamalai', lat: 12.2253, lng: 79.0747 },
  { name: 'Ambur', state: 'Tamil Nadu', district: 'Tirupattur', lat: 12.7904, lng: 78.7167 },
  { name: 'Vaniyambadi', state: 'Tamil Nadu', district: 'Tirupattur', lat: 12.6822, lng: 78.6169 },
  { name: 'Tirupattur', state: 'Tamil Nadu', district: 'Tirupattur', lat: 12.4950, lng: 78.5678 },
  { name: 'Ranipet', state: 'Tamil Nadu', district: 'Ranipet', lat: 12.9272, lng: 79.3330 },
  { name: 'Ooty', state: 'Tamil Nadu', district: 'Nilgiris', lat: 11.4102, lng: 76.6950, aliases: ['Udhagamandalam'] },
  { name: 'Coonoor', state: 'Tamil Nadu', district: 'Nilgiris', lat: 11.3530, lng: 76.7959 },
  { name: 'Kodaikanal', state: 'Tamil Nadu', district: 'Dindigul', lat: 10.2381, lng: 77.4892 },
  { name: 'Pollachi', state: 'Tamil Nadu', district: 'Coimbatore', lat: 10.6609, lng: 77.0048 },
  { name: 'Mettupalayam', state: 'Tamil Nadu', district: 'Coimbatore', lat: 11.2997, lng: 76.9349 },
  { name: 'Udumalpet', state: 'Tamil Nadu', district: 'Tiruppur', lat: 10.5855, lng: 77.2478 },
  { name: 'Palani', state: 'Tamil Nadu', district: 'Dindigul', lat: 10.4500, lng: 77.5167 },
  { name: 'Theni', state: 'Tamil Nadu', district: 'Theni', lat: 10.0104, lng: 77.4768 },
  { name: 'Sivakasi', state: 'Tamil Nadu', district: 'Virudhunagar', lat: 9.4533, lng: 77.8024 },
  { name: 'Virudhunagar', state: 'Tamil Nadu', district: 'Virudhunagar', lat: 9.5680, lng: 77.9624 },
  { name: 'Karaikudi', state: 'Tamil Nadu', district: 'Sivaganga', lat: 10.0735, lng: 78.7732 },
  { name: 'Sivaganga', state: 'Tamil Nadu', district: 'Sivaganga', lat: 9.8433, lng: 78.4809 },
  { name: 'Pudukkottai', state: 'Tamil Nadu', district: 'Pudukkottai', lat: 10.3797, lng: 78.8208 },
  { name: 'Ramanathapuram', state: 'Tamil Nadu', district: 'Ramanathapuram', lat: 9.3639, lng: 78.8395 },
  { name: 'Rameswaram', state: 'Tamil Nadu', district: 'Ramanathapuram', lat: 9.2876, lng: 79.3129 },
  { name: 'Nagapattinam', state: 'Tamil Nadu', district: 'Nagapattinam', lat: 10.7672, lng: 79.8449 },
  { name: 'Mayiladuthurai', state: 'Tamil Nadu', district: 'Mayiladuthurai', lat: 11.1018, lng: 79.6526 },
  { name: 'Thiruvarur', state: 'Tamil Nadu', district: 'Thiruvarur', lat: 10.7725, lng: 79.6368 },
  { name: 'Tenkasi', state: 'Tamil Nadu', district: 'Tenkasi', lat: 8.9594, lng: 77.3161 },

  // KERALA (All districts & major towns)
  { name: 'Kochi', state: 'Kerala', district: 'Ernakulam', lat: 9.9312, lng: 76.2673, aliases: ['Cochin', 'Ernakulam'] },
  { name: 'Thiruvananthapuram', state: 'Kerala', district: 'Thiruvananthapuram', lat: 8.5241, lng: 76.9366, aliases: ['Trivandrum'] },
  { name: 'Kozhikode', state: 'Kerala', district: 'Kozhikode', lat: 11.2588, lng: 75.7804, aliases: ['Calicut'] },
  { name: 'Thrissur', state: 'Kerala', district: 'Thrissur', lat: 10.5276, lng: 76.2144, aliases: ['Trichur'] },
  { name: 'Kollam', state: 'Kerala', district: 'Kollam', lat: 8.8932, lng: 76.6141, aliases: ['Quilon'] },
  { name: 'Kannur', state: 'Kerala', district: 'Kannur', lat: 11.8745, lng: 75.3704, aliases: ['Cannanore'] },
  { name: 'Palakkad', state: 'Kerala', district: 'Palakkad', lat: 10.7867, lng: 76.6548, aliases: ['Palghat'] },
  { name: 'Alappuzha', state: 'Kerala', district: 'Alappuzha', lat: 9.4981, lng: 76.3388, aliases: ['Alleppey'] },
  { name: 'Kottayam', state: 'Kerala', district: 'Kottayam', lat: 9.5916, lng: 76.5222 },
  { name: 'Malappuram', state: 'Kerala', district: 'Malappuram', lat: 11.0510, lng: 76.0711 },
  { name: 'Kasaragod', state: 'Kerala', district: 'Kasaragod', lat: 12.4996, lng: 74.9869 },
  { name: 'Kanhangad', state: 'Kerala', district: 'Kasaragod', lat: 12.3069, lng: 75.0911 },
  { name: 'Kalpetta', state: 'Kerala', district: 'Wayanad', lat: 11.6103, lng: 76.0828, aliases: ['Wayanad'] },
  { name: 'Sulthan Bathery', state: 'Kerala', district: 'Wayanad', lat: 11.6645, lng: 76.2570 },
  { name: 'Munnar', state: 'Kerala', district: 'Idukki', lat: 10.0889, lng: 77.0595 },
  { name: 'Thodupuzha', state: 'Kerala', district: 'Idukki', lat: 9.8959, lng: 76.7184 },
  { name: 'Pathanamthitta', state: 'Kerala', district: 'Pathanamthitta', lat: 9.2648, lng: 76.7870 },
  { name: 'Tirur', state: 'Kerala', district: 'Malappuram', lat: 10.9167, lng: 75.9245 },
  { name: 'Manjeri', state: 'Kerala', district: 'Malappuram', lat: 11.1197, lng: 76.1219 },
  { name: 'Thalassery', state: 'Kerala', district: 'Kannur', lat: 11.7491, lng: 75.4890 },
  { name: 'Payyanur', state: 'Kerala', district: 'Kannur', lat: 12.0977, lng: 75.1934 },
  { name: 'Aluva', state: 'Kerala', district: 'Ernakulam', lat: 10.1076, lng: 76.3516 },
  { name: 'Muvattupuzha', state: 'Kerala', district: 'Ernakulam', lat: 9.9894, lng: 76.5790 },
  { name: 'Guruvayur', state: 'Kerala', district: 'Thrissur', lat: 10.5946, lng: 76.0411 },
  { name: 'Chalakudy', state: 'Kerala', district: 'Thrissur', lat: 10.3007, lng: 76.3372 },
  { name: 'Varkala', state: 'Kerala', district: 'Thiruvananthapuram', lat: 8.7379, lng: 76.7163 },

  // TELANGANA & ANDHRA PRADESH
  { name: 'Hyderabad', state: 'Telangana', district: 'Hyderabad', lat: 17.3850, lng: 78.4867, aliases: ['Secunderabad', 'Cyberabad'] },
  { name: 'Warangal', state: 'Telangana', district: 'Warangal', lat: 17.9689, lng: 79.5941, aliases: ['Hanamkonda'] },
  { name: 'Nizamabad', state: 'Telangana', district: 'Nizamabad', lat: 18.6725, lng: 78.0941 },
  { name: 'Karimnagar', state: 'Telangana', district: 'Karimnagar', lat: 18.4386, lng: 79.1288 },
  { name: 'Khammam', state: 'Telangana', district: 'Khammam', lat: 17.2473, lng: 80.1514 },
  { name: 'Ramagundam', state: 'Telangana', district: 'Peddapalli', lat: 18.7556, lng: 79.4740 },
  { name: 'Mahbubnagar', state: 'Telangana', district: 'Mahbubnagar', lat: 16.7488, lng: 78.0035 },
  { name: 'Nalgonda', state: 'Telangana', district: 'Nalgonda', lat: 17.0575, lng: 79.2684 },
  { name: 'Adilabad', state: 'Telangana', district: 'Adilabad', lat: 19.6641, lng: 78.5320 },
  { name: 'Suryapet', state: 'Telangana', district: 'Suryapet', lat: 17.1415, lng: 79.6236 },
  { name: 'Siddipet', state: 'Telangana', district: 'Siddipet', lat: 18.1019, lng: 78.8521 },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', district: 'Visakhapatnam', lat: 17.6868, lng: 83.2185, aliases: ['Vizag'] },
  { name: 'Vijayawada', state: 'Andhra Pradesh', district: 'NTR', lat: 16.5062, lng: 80.6480, aliases: ['Bezawada'] },
  { name: 'Guntur', state: 'Andhra Pradesh', district: 'Guntur', lat: 16.3067, lng: 80.4365 },
  { name: 'Nellore', state: 'Andhra Pradesh', district: 'SPSR Nellore', lat: 14.4426, lng: 79.9865 },
  { name: 'Kurnool', state: 'Andhra Pradesh', district: 'Kurnool', lat: 15.8281, lng: 78.0373 },
  { name: 'Tirupati', state: 'Andhra Pradesh', district: 'Tirupati', lat: 13.6288, lng: 79.4192 },
  { name: 'Rajahmundry', state: 'Andhra Pradesh', district: 'East Godavari', lat: 17.0005, lng: 81.8040, aliases: ['Rajamahendravaram'] },
  { name: 'Kakinada', state: 'Andhra Pradesh', district: 'Kakinada', lat: 16.9891, lng: 82.2475 },
  { name: 'Kadapa', state: 'Andhra Pradesh', district: 'YSR Kadapa', lat: 14.4673, lng: 78.8242, aliases: ['Cuddapah'] },
  { name: 'Anantapur', state: 'Andhra Pradesh', district: 'Anantapur', lat: 14.6819, lng: 77.6006, aliases: ['Ananthapuramu'] },
  { name: 'Chittoor', state: 'Andhra Pradesh', district: 'Chittoor', lat: 13.2172, lng: 79.1003 },
  { name: 'Madanapalle', state: 'Andhra Pradesh', district: 'Annamayya', lat: 13.5503, lng: 78.5029 },
  { name: 'Hindupur', state: 'Andhra Pradesh', district: 'Sri Sathya Sai', lat: 13.8281, lng: 77.4914 },
  { name: 'Puttaparthi', state: 'Andhra Pradesh', district: 'Sri Sathya Sai', lat: 14.1652, lng: 77.8117 },
  { name: 'Kuppam', state: 'Andhra Pradesh', district: 'Chittoor', lat: 12.7485, lng: 78.3422 },
  { name: 'Eluru', state: 'Andhra Pradesh', district: 'Eluru', lat: 16.7107, lng: 81.0952 },
  { name: 'Ongole', state: 'Andhra Pradesh', district: 'Prakasam', lat: 15.5057, lng: 80.0499 },
  { name: 'Vizianagaram', state: 'Andhra Pradesh', district: 'Vizianagaram', lat: 18.1067, lng: 83.3956 },
  { name: 'Srikakulam', state: 'Andhra Pradesh', district: 'Srikakulam', lat: 18.2949, lng: 83.8938 },
  { name: 'Machilipatnam', state: 'Andhra Pradesh', district: 'Krishna', lat: 16.1875, lng: 81.1389 },
  { name: 'Bhimavaram', state: 'Andhra Pradesh', district: 'West Godavari', lat: 16.5449, lng: 81.5212 },

  // MAHARASHTRA & GOA
  { name: 'Mumbai', state: 'Maharashtra', district: 'Mumbai', lat: 19.0760, lng: 72.8777, aliases: ['Bombay'] },
  { name: 'Pune', state: 'Maharashtra', district: 'Pune', lat: 18.5204, lng: 73.8567, aliases: ['Poona'] },
  { name: 'Nagpur', state: 'Maharashtra', district: 'Nagpur', lat: 21.1458, lng: 79.0882 },
  { name: 'Thane', state: 'Maharashtra', district: 'Thane', lat: 19.2183, lng: 72.9781 },
  { name: 'Navi Mumbai', state: 'Maharashtra', district: 'Thane', lat: 19.0330, lng: 73.0297 },
  { name: 'Nashik', state: 'Maharashtra', district: 'Nashik', lat: 19.9975, lng: 73.7898, aliases: ['Nasik'] },
  { name: 'Aurangabad', state: 'Maharashtra', district: 'Chhatrapati Sambhajinagar', lat: 19.8762, lng: 75.3433, aliases: ['Chhatrapati Sambhajinagar'] },
  { name: 'Solapur', state: 'Maharashtra', district: 'Solapur', lat: 17.6599, lng: 75.9064 },
  { name: 'Kolhapur', state: 'Maharashtra', district: 'Kolhapur', lat: 16.7050, lng: 74.2433 },
  { name: 'Amravati', state: 'Maharashtra', district: 'Amravati', lat: 20.9374, lng: 77.7796 },
  { name: 'Nanded', state: 'Maharashtra', district: 'Nanded', lat: 19.1383, lng: 77.3210 },
  { name: 'Sangli', state: 'Maharashtra', district: 'Sangli', lat: 16.8524, lng: 74.5815 },
  { name: 'Satara', state: 'Maharashtra', district: 'Satara', lat: 17.6805, lng: 74.0183 },
  { name: 'Lonavala', state: 'Maharashtra', district: 'Pune', lat: 18.7557, lng: 73.4091 },
  { name: 'Mahabaleshwar', state: 'Maharashtra', district: 'Satara', lat: 17.9307, lng: 73.6477 },
  { name: 'Ahmednagar', state: 'Maharashtra', district: 'Ahilyanagar', lat: 19.0948, lng: 74.7480, aliases: ['Ahilyanagar'] },
  { name: 'Jalgaon', state: 'Maharashtra', district: 'Jalgaon', lat: 21.0077, lng: 75.5626 },
  { name: 'Akola', state: 'Maharashtra', district: 'Akola', lat: 20.7002, lng: 77.0082 },
  { name: 'Latur', state: 'Maharashtra', district: 'Latur', lat: 18.4088, lng: 76.5604 },
  { name: 'Dhule', state: 'Maharashtra', district: 'Dhule', lat: 20.9042, lng: 74.7749 },
  { name: 'Chandrapur', state: 'Maharashtra', district: 'Chandrapur', lat: 19.9615, lng: 79.2961 },
  { name: 'Parbhani', state: 'Maharashtra', district: 'Parbhani', lat: 19.2608, lng: 76.7748 },
  { name: 'Ratnagiri', state: 'Maharashtra', district: 'Ratnagiri', lat: 16.9902, lng: 73.3120 },
  { name: 'Alibag', state: 'Maharashtra', district: 'Raigad', lat: 18.6414, lng: 72.8722, aliases: ['Alibaug'] },
  { name: 'Panvel', state: 'Maharashtra', district: 'Raigad', lat: 18.9894, lng: 73.1175 },
  { name: 'Shirdi', state: 'Maharashtra', district: 'Ahilyanagar', lat: 19.7645, lng: 74.4762 },
  { name: 'Panaji', state: 'Goa', district: 'North Goa', lat: 15.4909, lng: 73.8278, aliases: ['Panjim', 'Goa'] },
  { name: 'Margao', state: 'Goa', district: 'South Goa', lat: 15.2832, lng: 73.9862, aliases: ['Madgaon'] },
  { name: 'Vasco da Gama', state: 'Goa', district: 'South Goa', lat: 15.3982, lng: 73.8113 },
  { name: 'Mapusa', state: 'Goa', district: 'North Goa', lat: 15.5915, lng: 73.8090 },
  { name: 'Ponda', state: 'Goa', district: 'North Goa', lat: 15.4034, lng: 74.0152 },

  // GUJARAT & RAJASTHAN
  { name: 'Ahmedabad', state: 'Gujarat', district: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { name: 'Surat', state: 'Gujarat', district: 'Surat', lat: 21.1702, lng: 72.8311 },
  { name: 'Vadodara', state: 'Gujarat', district: 'Vadodara', lat: 22.3072, lng: 73.1812, aliases: ['Baroda'] },
  { name: 'Rajkot', state: 'Gujarat', district: 'Rajkot', lat: 22.3039, lng: 70.8022 },
  { name: 'Gandhinagar', state: 'Gujarat', district: 'Gandhinagar', lat: 23.2156, lng: 72.6369 },
  { name: 'Bhavnagar', state: 'Gujarat', district: 'Bhavnagar', lat: 21.7645, lng: 72.1519 },
  { name: 'Jamnagar', state: 'Gujarat', district: 'Jamnagar', lat: 22.4707, lng: 70.0577 },
  { name: 'Junagadh', state: 'Gujarat', district: 'Junagadh', lat: 21.5222, lng: 70.4579 },
  { name: 'Anand', state: 'Gujarat', district: 'Anand', lat: 22.5645, lng: 72.9289 },
  { name: 'Navsari', state: 'Gujarat', district: 'Navsari', lat: 20.9467, lng: 72.9520 },
  { name: 'Vapi', state: 'Gujarat', district: 'Valsad', lat: 20.3893, lng: 72.9106 },
  { name: 'Bharuch', state: 'Gujarat', district: 'Bharuch', lat: 21.7051, lng: 72.9959 },
  { name: 'Bhuj', state: 'Gujarat', district: 'Kutch', lat: 23.2420, lng: 69.6669 },
  { name: 'Gandhidham', state: 'Gujarat', district: 'Kutch', lat: 23.0753, lng: 70.1337 },
  { name: 'Mehsana', state: 'Gujarat', district: 'Mehsana', lat: 23.5880, lng: 72.3693 },
  { name: 'Jaipur', state: 'Rajasthan', district: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  { name: 'Jodhpur', state: 'Rajasthan', district: 'Jodhpur', lat: 26.2389, lng: 73.0243 },
  { name: 'Udaipur', state: 'Rajasthan', district: 'Udaipur', lat: 24.5854, lng: 73.7125 },
  { name: 'Kota', state: 'Rajasthan', district: 'Kota', lat: 25.2138, lng: 75.8648 },
  { name: 'Ajmer', state: 'Rajasthan', district: 'Ajmer', lat: 26.4499, lng: 74.6399 },
  { name: 'Bikaner', state: 'Rajasthan', district: 'Bikaner', lat: 28.0229, lng: 73.3119 },
  { name: 'Bhilwara', state: 'Rajasthan', district: 'Bhilwara', lat: 25.3407, lng: 74.6313 },
  { name: 'Alwar', state: 'Rajasthan', district: 'Alwar', lat: 27.5530, lng: 76.6346 },
  { name: 'Sikar', state: 'Rajasthan', district: 'Sikar', lat: 27.6094, lng: 75.1399 },
  { name: 'Jaisalmer', state: 'Rajasthan', district: 'Jaisalmer', lat: 26.9157, lng: 70.9083 },
  { name: 'Mount Abu', state: 'Rajasthan', district: 'Sirohi', lat: 24.5926, lng: 72.7156 },

  // DELHI NCR, HARYANA, PUNJAB, CHANDIGARH, HIMACHAL, J&K, LADAKH, UTTARAKHAND, UP
  { name: 'New Delhi', state: 'Delhi NCR', district: 'New Delhi', lat: 28.6139, lng: 77.2090, aliases: ['Delhi', 'NCR'] },
  { name: 'Gurugram', state: 'Haryana', district: 'Gurugram', lat: 28.4595, lng: 77.0266, aliases: ['Gurgaon'] },
  { name: 'Faridabad', state: 'Haryana', district: 'Faridabad', lat: 28.4089, lng: 77.3178 },
  { name: 'Panipat', state: 'Haryana', district: 'Panipat', lat: 29.3909, lng: 76.9635 },
  { name: 'Ambala', state: 'Haryana', district: 'Ambala', lat: 30.3782, lng: 76.7767 },
  { name: 'Karnal', state: 'Haryana', district: 'Karnal', lat: 29.6857, lng: 76.9905 },
  { name: 'Rohtak', state: 'Haryana', district: 'Rohtak', lat: 28.8955, lng: 76.6066 },
  { name: 'Hisar', state: 'Haryana', district: 'Hisar', lat: 29.1492, lng: 75.7217 },
  { name: 'Sonipat', state: 'Haryana', district: 'Sonipat', lat: 28.9931, lng: 77.0151 },
  { name: 'Panchkula', state: 'Haryana', district: 'Panchkula', lat: 30.6942, lng: 76.8606 },
  { name: 'Kurukshetra', state: 'Haryana', district: 'Kurukshetra', lat: 29.9695, lng: 76.8783 },
  { name: 'Chandigarh', state: 'Chandigarh', district: 'Chandigarh', lat: 30.7333, lng: 76.7794 },
  { name: 'Mohali', state: 'Punjab', district: 'SAS Nagar', lat: 30.7046, lng: 76.7179 },
  { name: 'Ludhiana', state: 'Punjab', district: 'Ludhiana', lat: 30.9010, lng: 75.8573 },
  { name: 'Amritsar', state: 'Punjab', district: 'Amritsar', lat: 31.6340, lng: 74.8723 },
  { name: 'Jalandhar', state: 'Punjab', district: 'Jalandhar', lat: 31.3260, lng: 75.5762 },
  { name: 'Patiala', state: 'Punjab', district: 'Patiala', lat: 30.3398, lng: 76.3869 },
  { name: 'Bathinda', state: 'Punjab', district: 'Bathinda', lat: 30.2110, lng: 74.9455 },
  { name: 'Pathankot', state: 'Punjab', district: 'Pathankot', lat: 32.2643, lng: 75.6421 },
  { name: 'Shimla', state: 'Himachal Pradesh', district: 'Shimla', lat: 31.1048, lng: 77.1734, aliases: ['Simla'] },
  { name: 'Manali', state: 'Himachal Pradesh', district: 'Kullu', lat: 32.2432, lng: 77.1892 },
  { name: 'Dharamshala', state: 'Himachal Pradesh', district: 'Kangra', lat: 32.2190, lng: 76.3234 },
  { name: 'Solan', state: 'Himachal Pradesh', district: 'Solan', lat: 30.9045, lng: 77.0967 },
  { name: 'Kullu', state: 'Himachal Pradesh', district: 'Kullu', lat: 31.9592, lng: 77.1089 },
  { name: 'Srinagar', state: 'Jammu and Kashmir', district: 'Srinagar', lat: 34.0837, lng: 74.7973 },
  { name: 'Jammu', state: 'Jammu and Kashmir', district: 'Jammu', lat: 32.7266, lng: 74.8570 },
  { name: 'Leh', state: 'Ladakh', district: 'Leh', lat: 34.1526, lng: 77.5771, aliases: ['Ladakh'] },
  { name: 'Dehradun', state: 'Uttarakhand', district: 'Dehradun', lat: 30.3165, lng: 78.0322 },
  { name: 'Haridwar', state: 'Uttarakhand', district: 'Haridwar', lat: 29.9457, lng: 78.1642 },
  { name: 'Rishikesh', state: 'Uttarakhand', district: 'Dehradun', lat: 30.0869, lng: 78.2676 },
  { name: 'Roorkee', state: 'Uttarakhand', district: 'Haridwar', lat: 29.8543, lng: 77.8880 },
  { name: 'Haldwani', state: 'Uttarakhand', district: 'Nainital', lat: 29.2183, lng: 79.5130 },
  { name: 'Nainital', state: 'Uttarakhand', district: 'Nainital', lat: 29.3919, lng: 79.4542 },
  { name: 'Noida', state: 'Uttar Pradesh', district: 'Gautam Buddha Nagar', lat: 28.5355, lng: 77.3910 },
  { name: 'Greater Noida', state: 'Uttar Pradesh', district: 'Gautam Buddha Nagar', lat: 28.4744, lng: 77.5040 },
  { name: 'Ghaziabad', state: 'Uttar Pradesh', district: 'Ghaziabad', lat: 28.6692, lng: 77.4538 },
  { name: 'Lucknow', state: 'Uttar Pradesh', district: 'Lucknow', lat: 26.8467, lng: 80.9462 },
  { name: 'Kanpur', state: 'Uttar Pradesh', district: 'Kanpur Nagar', lat: 26.4499, lng: 80.3319 },
  { name: 'Varanasi', state: 'Uttar Pradesh', district: 'Varanasi', lat: 25.3176, lng: 82.9739, aliases: ['Banaras', 'Kashi'] },
  { name: 'Prayagraj', state: 'Uttar Pradesh', district: 'Prayagraj', lat: 25.4358, lng: 81.8463, aliases: ['Allahabad'] },
  { name: 'Agra', state: 'Uttar Pradesh', district: 'Agra', lat: 27.1767, lng: 78.0081 },
  { name: 'Meerut', state: 'Uttar Pradesh', district: 'Meerut', lat: 28.9845, lng: 77.7064 },
  { name: 'Bareilly', state: 'Uttar Pradesh', district: 'Bareilly', lat: 28.3670, lng: 79.4304 },
  { name: 'Aligarh', state: 'Uttar Pradesh', district: 'Aligarh', lat: 27.8974, lng: 78.0880 },
  { name: 'Moradabad', state: 'Uttar Pradesh', district: 'Moradabad', lat: 28.8386, lng: 78.7733 },
  { name: 'Gorakhpur', state: 'Uttar Pradesh', district: 'Gorakhpur', lat: 26.7606, lng: 83.3732 },
  { name: 'Jhansi', state: 'Uttar Pradesh', district: 'Jhansi', lat: 25.4484, lng: 78.5685 },
  { name: 'Mathura', state: 'Uttar Pradesh', district: 'Mathura', lat: 27.4924, lng: 77.6737 },
  { name: 'Ayodhya', state: 'Uttar Pradesh', district: 'Ayodhya', lat: 26.7922, lng: 82.1998 },

  // MADHYA PRADESH, CHHATTISGARH, WEST BENGAL, ODISHA, BIHAR, JHARKHAND, NORTH EAST & UTs
  { name: 'Indore', state: 'Madhya Pradesh', district: 'Indore', lat: 22.7196, lng: 75.8577 },
  { name: 'Bhopal', state: 'Madhya Pradesh', district: 'Bhopal', lat: 23.2599, lng: 77.4126 },
  { name: 'Jabalpur', state: 'Madhya Pradesh', district: 'Jabalpur', lat: 23.1815, lng: 79.9864 },
  { name: 'Gwalior', state: 'Madhya Pradesh', district: 'Gwalior', lat: 26.2183, lng: 78.1828 },
  { name: 'Ujjain', state: 'Madhya Pradesh', district: 'Ujjain', lat: 23.1765, lng: 75.7885 },
  { name: 'Sagar (MP)', state: 'Madhya Pradesh', district: 'Sagar', lat: 23.8388, lng: 78.7378 },
  { name: 'Rewa', state: 'Madhya Pradesh', district: 'Rewa', lat: 24.5362, lng: 81.3037 },
  { name: 'Satna', state: 'Madhya Pradesh', district: 'Satna', lat: 24.6005, lng: 80.8322 },
  { name: 'Raipur', state: 'Chhattisgarh', district: 'Raipur', lat: 21.2514, lng: 81.6296 },
  { name: 'Bhilai', state: 'Chhattisgarh', district: 'Durg', lat: 21.1938, lng: 81.3509, aliases: ['Durg'] },
  { name: 'Bilaspur', state: 'Chhattisgarh', district: 'Bilaspur', lat: 22.0797, lng: 82.1409 },
  { name: 'Kolkata', state: 'West Bengal', district: 'Kolkata', lat: 22.5726, lng: 88.3639, aliases: ['Calcutta'] },
  { name: 'Howrah', state: 'West Bengal', district: 'Howrah', lat: 22.5958, lng: 88.2636 },
  { name: 'Siliguri', state: 'West Bengal', district: 'Darjeeling', lat: 26.7271, lng: 88.3953 },
  { name: 'Durgapur', state: 'West Bengal', district: 'Paschim Bardhaman', lat: 23.5204, lng: 87.3119 },
  { name: 'Asansol', state: 'West Bengal', district: 'Paschim Bardhaman', lat: 23.6739, lng: 86.9524 },
  { name: 'Darjeeling', state: 'West Bengal', district: 'Darjeeling', lat: 27.0410, lng: 88.2663 },
  { name: 'Kharagpur', state: 'West Bengal', district: 'Paschim Medinipur', lat: 22.3460, lng: 87.2320 },
  { name: 'Bhubaneswar', state: 'Odisha', district: 'Khordha', lat: 20.2961, lng: 85.8245 },
  { name: 'Cuttack', state: 'Odisha', district: 'Cuttack', lat: 20.4625, lng: 85.8830 },
  { name: 'Rourkela', state: 'Odisha', district: 'Sundargarh', lat: 22.2604, lng: 84.8536 },
  { name: 'Berhampur', state: 'Odisha', district: 'Ganjam', lat: 19.3150, lng: 84.7941, aliases: ['Brahmapur'] },
  { name: 'Sambalpur', state: 'Odisha', district: 'Sambalpur', lat: 21.4669, lng: 83.9812 },
  { name: 'Puri', state: 'Odisha', district: 'Puri', lat: 19.8135, lng: 85.8312 },
  { name: 'Patna', state: 'Bihar', district: 'Patna', lat: 25.5941, lng: 85.1376 },
  { name: 'Gaya', state: 'Bihar', district: 'Gaya', lat: 24.7914, lng: 85.0002 },
  { name: 'Muzaffarpur', state: 'Bihar', district: 'Muzaffarpur', lat: 26.1197, lng: 85.3910 },
  { name: 'Bhagalpur', state: 'Bihar', district: 'Bhagalpur', lat: 25.2425, lng: 86.9842 },
  { name: 'Darbhanga', state: 'Bihar', district: 'Darbhanga', lat: 26.1542, lng: 85.8918 },
  { name: 'Ranchi', state: 'Jharkhand', district: 'Ranchi', lat: 23.3441, lng: 85.3096 },
  { name: 'Jamshedpur', state: 'Jharkhand', district: 'East Singhbhum', lat: 22.8046, lng: 86.2029 },
  { name: 'Dhanbad', state: 'Jharkhand', district: 'Dhanbad', lat: 23.7957, lng: 86.4304 },
  { name: 'Bokaro Steel City', state: 'Jharkhand', district: 'Bokaro', lat: 23.6693, lng: 86.1511 },
  { name: 'Guwahati', state: 'Assam', district: 'Kamrup Metropolitan', lat: 26.1445, lng: 91.7362, aliases: ['Gauhati'] },
  { name: 'Silchar', state: 'Assam', district: 'Cachar', lat: 24.8333, lng: 92.7789 },
  { name: 'Dibrugarh', state: 'Assam', district: 'Dibrugarh', lat: 27.4728, lng: 94.9120 },
  { name: 'Jorhat', state: 'Assam', district: 'Jorhat', lat: 26.7509, lng: 94.2037 },
  { name: 'Tezpur', state: 'Assam', district: 'Sonitpur', lat: 26.6528, lng: 92.7926 },
  { name: 'Shillong', state: 'Meghalaya', district: 'East Khasi Hills', lat: 25.5788, lng: 91.8933 },
  { name: 'Imphal', state: 'Manipur', district: 'Imphal West', lat: 24.8170, lng: 93.9368 },
  { name: 'Aizawl', state: 'Mizoram', district: 'Aizawl', lat: 23.7271, lng: 92.7176 },
  { name: 'Kohima', state: 'Nagaland', district: 'Kohima', lat: 25.6751, lng: 94.1086 },
  { name: 'Dimapur', state: 'Nagaland', district: 'Dimapur', lat: 25.9091, lng: 93.7266 },
  { name: 'Agartala', state: 'Tripura', district: 'West Tripura', lat: 23.8315, lng: 91.2868 },
  { name: 'Itanagar', state: 'Arunachal Pradesh', district: 'Papum Pare', lat: 27.0844, lng: 93.6053 },
  { name: 'Tawang', state: 'Arunachal Pradesh', district: 'Tawang', lat: 27.5861, lng: 91.8594 },
  { name: 'Gangtok', state: 'Sikkim', district: 'Gangtok', lat: 27.3314, lng: 88.6138 },
  { name: 'Puducherry', state: 'Puducherry', district: 'Puducherry', lat: 11.9416, lng: 79.8083, aliases: ['Pondicherry', 'Pondy'] },
  { name: 'Karaikal', state: 'Puducherry', district: 'Karaikal', lat: 10.9254, lng: 79.8380 },
  { name: 'Port Blair', state: 'Andaman and Nicobar Islands', district: 'South Andaman', lat: 11.6234, lng: 92.7265, aliases: ['Sri Vijaya Puram'] },
  { name: 'Silvassa', state: 'Dadra and Nagar Haveli and Daman and Diu', district: 'Dadra and Nagar Haveli', lat: 20.2766, lng: 73.0083 },
  { name: 'Daman', state: 'Dadra and Nagar Haveli and Daman and Diu', district: 'Daman', lat: 20.3974, lng: 72.8328 }
];

export const INDIA_TOWN_PLACE_SUGGESTIONS: PlaceSuggestion[] = ALL_INDIA_CITIES_AND_TOWNS.map(
  (t, idx) => ({
    id: `ind_town_${idx}_${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    name: t.name,
    locality: t.district && t.district !== t.name ? `${t.district}, ${t.state}` : t.state,
    address: `${t.name}${t.district && t.district !== t.name ? `, ${t.district}` : ''}, ${t.state}, India`,
    category: t.category || 'City / Town',
    latitude: t.lat,
    longitude: t.lng,
    source: 'India Atlas'
  })
);

/**
 * Instant Google Maps-style search across all Indian cities, towns, districts, and live external geocoding results.
 * Works from the very first typed character (length >= 1) and supports aliases, districts, states, and fuzzy matching.
 */
export function searchAllIndiaLocations(
  rawQuery: string,
  externalResults: PlaceSuggestion[] = []
): PlaceSuggestion[] {
  const q = (rawQuery || '').trim();
  if (!q) {
    return INDIA_TOWN_PLACE_SUGGESTIONS.slice(0, 12);
  }

  const qLower = q.toLowerCase();
  const tokens = qLower.split(/[\s,.-]+/).filter(Boolean);

  const scored: { item: PlaceSuggestion; score: number }[] = [];

  // 1. Score all India cities & towns
  for (let i = 0; i < ALL_INDIA_CITIES_AND_TOWNS.length; i++) {
    const entry = ALL_INDIA_CITIES_AND_TOWNS[i];
    const suggestion = INDIA_TOWN_PLACE_SUGGESTIONS[i];

    const nameLower = entry.name.toLowerCase();
    const stateLower = entry.state.toLowerCase();
    const distLower = (entry.district || '').toLowerCase();
    const aliasesLower = (entry.aliases || []).map(a => a.toLowerCase());

    let score = 0;

    if (nameLower === qLower || aliasesLower.includes(qLower)) {
      score += 300;
    } else if (nameLower.startsWith(qLower) || aliasesLower.some(a => a.startsWith(qLower))) {
      score += 220;
    } else if (nameLower.includes(qLower) || aliasesLower.some(a => a.includes(qLower))) {
      score += 150;
    } else if (distLower.startsWith(qLower)) {
      score += 110;
    } else if (stateLower.startsWith(qLower)) {
      score += 80;
    }

    // Multi-token check (e.g. "Kolar Karnataka", "Whitefield Bangalore", "Hosur Tamil Nadu")
    let matchedTokens = 0;
    for (const tk of tokens) {
      if (
        nameLower.includes(tk) ||
        distLower.includes(tk) ||
        stateLower.includes(tk) ||
        aliasesLower.some(a => a.includes(tk))
      ) {
        matchedTokens++;
        score += 35;
      }
    }

    if (tokens.length > 1 && matchedTokens === tokens.length) {
      score += 120;
    }

    if (score > 0) {
      scored.push({ item: suggestion, score });
    }
  }

  // 2. Include live external geocoding results (OpenStreetMap Nominatim / Photon) & POI directory
  const rankedPoiAndExternal = q.length >= 2 ? searchAndRankPlaces(q, externalResults) : externalResults;
  for (const ext of [...externalResults, ...rankedPoiAndExternal]) {
    const extNameLower = ext.name.toLowerCase();
    let extScore = 160;
    if (extNameLower === qLower) extScore = 310;
    else if (extNameLower.startsWith(qLower)) extScore = 240;
    else if (extNameLower.includes(qLower)) extScore = 190;
    scored.push({ item: ext, score: extScore });
  }

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by name + proximity
  const deduped: PlaceSuggestion[] = [];
  for (const { item } of scored) {
    const exists = deduped.some(existing => {
      const sameName = existing.name.toLowerCase() === item.name.toLowerCase();
      const closeCoords =
        Math.abs(existing.latitude - item.latitude) < 0.08 &&
        Math.abs(existing.longitude - item.longitude) < 0.08;
      return (sameName && closeCoords) || existing.id === item.id;
    });
    if (!exists) {
      deduped.push(item);
    }
    if (deduped.length >= 15) break;
  }

  return deduped;
}

/**
 * Queries live India location autocomplete via server proxy (/api/places/autocomplete)
 * with direct OpenStreetMap Nominatim India fallback so any town, village, suburb, or street in India resolves.
 */
export async function fetchLiveIndiaPlaces(
  query: string,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const trimmed = (query || '').trim();
  if (trimmed.length < 2) {
    return searchAllIndiaLocations(trimmed);
  }

  try {
    const res = await fetch(
      `/api/places/autocomplete?q=${encodeURIComponent(trimmed)}&countrycodes=in`,
      { signal }
    );
    if (res.ok) {
      const data = await res.json();
      const serverSuggestions: PlaceSuggestion[] = Array.isArray(data.suggestions)
        ? data.suggestions
        : [];
      return searchAllIndiaLocations(trimmed, serverSuggestions);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
  }

  // Direct client-side fallback to OpenStreetMap Nominatim restricted to India (countrycodes=in)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=in&limit=10&q=${encodeURIComponent(
      trimmed
    )}`;
    const nomRes = await fetch(nomUrl, {
      headers: { Accept: 'application/json', 'Accept-Language': 'en' },
      signal
    });
    if (nomRes.ok) {
      const items = await nomRes.json();
      if (Array.isArray(items)) {
        const mapped: PlaceSuggestion[] = items
          .map((item: any): PlaceSuggestion | null => {
            const lat = Number(item.lat);
            const lon = Number(item.lon);
            if (!isFinite(lat) || !isFinite(lon)) return null;
            const addr = item.address || {};
            const primaryName =
              item.name ||
              addr.city ||
              addr.town ||
              addr.village ||
              addr.suburb ||
              addr.municipality ||
              addr.county ||
              String(item.display_name || '').split(',')[0] ||
              trimmed;
            const localityParts = [
              addr.city || addr.town || addr.village || addr.state_district || addr.county,
              addr.state || 'India'
            ].filter(Boolean);
            return {
              id: `osm_in_${item.place_id || Math.random()}`,
              name: String(primaryName),
              locality: localityParts.join(', '),
              address: String(item.display_name || `${primaryName}, ${localityParts.join(', ')}`),
              category: 'City / Town / Location',
              latitude: Number(lat.toFixed(6)),
              longitude: Number(lon.toFixed(6)),
              source: 'OpenStreetMap India'
            };
          })
          .filter((x): x is PlaceSuggestion => x !== null);
        return searchAllIndiaLocations(trimmed, mapped);
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
  }

  return searchAllIndiaLocations(trimmed);
}
