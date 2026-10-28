import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Plus,
  ShieldCheck,
  Mail,
  Phone,
  AlertCircle,
  Image as ImageIcon,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Upload,
  Trash2,
  Edit2,
  CloudOff,
  CheckCircle2,
  Calendar,
  Gavel,
  Trophy,
  Clock,
  FileText,
  KeyRound,
  Tag,
  UserCheck
} from 'lucide-react';
import { MarketplaceItem, User } from '../types';
import {
  MarketplaceListingType,
  extractMarketplaceItemImages,
  resolveMarketplaceListingType,
  resolveMarketplaceOwnerContact,
  calculateRentalBookingCost,
  getSortedAuctionBids,
  getAuctionBidSummary,
  validateAndPlaceAuctionBid,
  selectAuctionWinner,
  createMarketplacePresetIllustration
} from '../utils/rules';
import { useAuth } from '../context/AuthContext';
import {
  CACHE_KEYS,
  saveToCache,
  loadFromCache,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  enqueueOfflineAction,
  normalizeMarketplaceResponse,
  canUserModifyRecord,
  reconcileCollectionWithCache,
  recordDeletedId,
  OFFLINE_SYNC_EVENT
} from '../utils/telemetryCache';

interface MarketplaceProps {
  currentUser?: User | null;
}

const SAMPLE_PHOTO_PRESETS = [
  { name: 'Boost Charger 3.0kW', url: createMarketplacePresetIllustration('charger') },
  { name: 'Aero Carbon Helmet', url: createMarketplacePresetIllustration('helmet') },
  { name: 'Touring Pannier Rig', url: createMarketplacePresetIllustration('panniers') },
  { name: 'Armored Track Suit', url: createMarketplacePresetIllustration('jacket') },
  { name: 'Carbon Wheels & Rearsets', url: createMarketplacePresetIllustration('carbon_wheels') }
];

const DRAFT_KEY = 'marketplace_listing_form_v2';

type SectionTab = 'buy' | 'rent' | 'auction' | 'all';

export const Marketplace: React.FC<MarketplaceProps> = ({ currentUser: propUser = null }) => {
  const { currentUser: authUser } = useAuth();
  const activeUser = propUser || authUser;

  const [items, setItems] = useState<MarketplaceItem[]>(() =>
    loadFromCache<MarketplaceItem[]>(CACHE_KEYS.MARKETPLACE, [])
  );
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionTab>('buy');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'saved' | 'offline' | 'error';
    message: string;
  } | null>(null);

  // Create / Edit Form State
  const initialDraft = loadFormDraft(DRAFT_KEY, {
    listingType: 'buy' as MarketplaceListingType,
    title: '',
    description: '',
    category: 'parts' as 'parts' | 'gear' | 'accessories' | 'rentals' | 'auctions' | 'other',
    price: '',
    condition: 'Like New' as 'New' | 'Like New' | 'Good' | 'Fair',
    compatibleModel: 'Both' as 'F77' | 'X47' | 'Both',
    generalLocation: '',
    contactPhone: '',
    contactEmail: '',
    costPerDay: '850',
    securityDeposit: '5000',
    minRentalDays: '1',
    maxRentalDays: '10',
    rentalRules:
      '1. Valid Pilot ID / Govt ID required at pickup.\n2. Return item clean and in undamaged working condition.\n3. Security deposit refunded immediately upon return inspection.',
    rentalAvailability: 'Available Now' as 'Available Now' | 'Currently Rented' | 'Booked Upcoming',
    startingBid: '15000',
    minBidIncrement: '500',
    reservePrice: '',
    auctionEndTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    photoList: [] as string[]
  });

  const [listingType, setListingType] = useState<MarketplaceListingType>(
    initialDraft.listingType || 'buy'
  );
  const [title, setTitle] = useState(initialDraft.title);
  const [description, setDescription] = useState(initialDraft.description);
  const [category, setCategory] = useState<
    'parts' | 'gear' | 'accessories' | 'rentals' | 'auctions' | 'other'
  >(initialDraft.category);
  const [price, setPrice] = useState(initialDraft.price);
  const [condition, setCondition] = useState<'New' | 'Like New' | 'Good' | 'Fair'>(
    initialDraft.condition
  );
  const [compatibleModel, setCompatibleModel] = useState<'F77' | 'X47' | 'Both'>(
    initialDraft.compatibleModel
  );
  const [generalLocation, setGeneralLocation] = useState(initialDraft.generalLocation);
  const [contactPhone, setContactPhone] = useState(
    initialDraft.contactPhone || activeUser?.mobile || '+91 98450 11099'
  );
  const [contactEmail, setContactEmail] = useState(
    initialDraft.contactEmail || activeUser?.email || 'pilot-desk@ultraviolette-squadron.in'
  );

  // Rental form state
  const [costPerDay, setCostPerDay] = useState(initialDraft.costPerDay || '850');
  const [securityDeposit, setSecurityDeposit] = useState(initialDraft.securityDeposit || '5000');
  const [minRentalDays, setMinRentalDays] = useState(initialDraft.minRentalDays || '1');
  const [maxRentalDays, setMaxRentalDays] = useState(initialDraft.maxRentalDays || '10');
  const [rentalRules, setRentalRules] = useState(
    initialDraft.rentalRules ||
      '1. Valid Pilot ID / Govt ID required at pickup.\n2. Return item clean and in undamaged working condition.\n3. Security deposit refunded immediately upon return inspection.'
  );
  const [rentalAvailability, setRentalAvailability] = useState<
    'Available Now' | 'Currently Rented' | 'Booked Upcoming'
  >(initialDraft.rentalAvailability || 'Available Now');

  // Auction form state
  const [startingBid, setStartingBid] = useState(initialDraft.startingBid || '15000');
  const [minBidIncrement, setMinBidIncrement] = useState(initialDraft.minBidIncrement || '500');
  const [reservePrice, setReservePrice] = useState(initialDraft.reservePrice || '');
  const [auctionEndTime, setAuctionEndTime] = useState(
    initialDraft.auctionEndTime ||
      new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  const [photoList, setPhotoList] = useState<string[]>(initialDraft.photoList || []);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Interactive Rental Booking State (inside detail modal)
  const [rentStartDate, setRentStartDate] = useState(
    () => new Date(Date.now() + 86400000).toISOString().split('T')[0]
  );
  const [rentDays, setRentDays] = useState<number>(2);
  const [renterNameInput, setRenterNameInput] = useState(activeUser?.fullName || '');
  const [renterPhoneInput, setRenterPhoneInput] = useState(activeUser?.mobile || '+91 98450 77210');
  const [renterEmailInput, setRenterEmailInput] = useState(
    activeUser?.email || 'pilot@ultraviolette-squadron.in'
  );
  const [rentNotes, setRentNotes] = useState('');
  const [rentAcceptedRules, setRentAcceptedRules] = useState(true);
  const [rentActionError, setRentActionError] = useState('');
  const [isBookingRent, setIsBookingRent] = useState(false);

  // Interactive Auction Bidding State (inside detail modal)
  const [bidAmountInput, setBidAmountInput] = useState('');
  const [bidderNameInput, setBidderNameInput] = useState(activeUser?.fullName || '');
  const [bidderPhoneInput, setBidderPhoneInput] = useState(activeUser?.mobile || '+91 98450 88420');
  const [bidderEmailInput, setBidderEmailInput] = useState(
    activeUser?.email || 'bidder@ultraviolette-squadron.in'
  );
  const [bidNoteInput, setBidNoteInput] = useState('');
  const [auctionActionError, setAuctionActionError] = useState('');
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const [isAwardingWinner, setIsAwardingWinner] = useState(false);

  // Sync user defaults when activeUser changes
  useEffect(() => {
    if (activeUser) {
      if (activeUser.mobile) {
        setContactPhone(prev => prev || activeUser.mobile);
        setRenterPhoneInput(prev => prev || activeUser.mobile);
        setBidderPhoneInput(prev => prev || activeUser.mobile);
      }
      if (activeUser.email) {
        setContactEmail(prev => prev || activeUser.email);
        setRenterEmailInput(prev => prev || activeUser.email);
        setBidderEmailInput(prev => prev || activeUser.email);
      }
      if (activeUser.fullName) {
        setRenterNameInput(prev => prev || activeUser.fullName);
        setBidderNameInput(prev => prev || activeUser.fullName);
      }
    }
  }, [activeUser]);

  // Persist draft whenever creating a new listing
  useEffect(() => {
    if (!editingItemId && (title || description || price || generalLocation || photoList.length > 0)) {
      saveFormDraft(DRAFT_KEY, {
        listingType,
        title,
        description,
        category,
        price,
        condition,
        compatibleModel,
        generalLocation,
        contactPhone,
        contactEmail,
        costPerDay,
        securityDeposit,
        minRentalDays,
        maxRentalDays,
        rentalRules,
        rentalAvailability,
        startingBid,
        minBidIncrement,
        reservePrice,
        auctionEndTime,
        photoList
      });
    }
  }, [
    listingType,
    title,
    description,
    category,
    price,
    condition,
    compatibleModel,
    generalLocation,
    contactPhone,
    contactEmail,
    costPerDay,
    securityDeposit,
    minRentalDays,
    maxRentalDays,
    rentalRules,
    rentalAvailability,
    startingBid,
    minBidIncrement,
    reservePrice,
    auctionEndTime,
    photoList,
    editingItemId
  ]);

  useEffect(() => {
    fetchItems();
    const handleSync = () => fetchItems();
    window.addEventListener(OFFLINE_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(OFFLINE_SYNC_EVENT, handleSync);
  }, [activeUser?.id]);

  // Initialize modal-specific state when a listing is opened
  useEffect(() => {
    if (!selectedItem) return;
    setRentActionError('');
    setAuctionActionError('');
    const type = resolveMarketplaceListingType(selectedItem);
    if (type === 'rent') {
      setRentDays(Math.max(1, Number(selectedItem.minRentalDays) || 2));
      setRentAcceptedRules(true);
    } else if (type === 'auction') {
      const summary = getAuctionBidSummary(selectedItem);
      setBidAmountInput(String(summary.minimumNextBid));
    }
  }, [selectedItem?.id]);

  const fetchItems = async () => {
    try {
      const headers: Record<string, string> = {};
      if (activeUser?.id) {
        headers['x-user-id'] = activeUser.id;
      }
      const res = await fetch('/api/marketplace', { headers });
      if (res.ok) {
        const data = await res.json();
        const normalized = normalizeMarketplaceResponse(data);
        const merged = reconcileCollectionWithCache<MarketplaceItem>(
          CACHE_KEYS.MARKETPLACE,
          normalized
        );
        setItems(merged);
        saveToCache(CACHE_KEYS.MARKETPLACE, merged);
        if (selectedItem) {
          const refreshed = merged.find(i => i.id === selectedItem.id);
          if (refreshed) setSelectedItem(refreshed);
        }
      }
    } catch {
      const cached = loadFromCache<MarketplaceItem[]>(CACHE_KEYS.MARKETPLACE, []);
      if (cached.length > 0) setItems(cached);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = event => {
        if (event.target?.result && typeof event.target.result === 'string') {
          setPhotoList(prev => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleAddPhotoUrl = () => {
    if (!photoUrlInput.trim()) return;
    setPhotoList(prev => [...prev, photoUrlInput.trim()]);
    setPhotoUrlInput('');
  };

  const handleRemovePhoto = (index: number) => {
    setPhotoList(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddPresetPhoto = (url: string) => {
    setPhotoList(prev => [...prev, url]);
  };

  const openCreateModalForType = (targetType: MarketplaceListingType) => {
    setEditingItemId(null);
    resetForm(targetType);
    setShowCreateModal(true);
  };

  const openEditModal = (item: MarketplaceItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const resolvedType = resolveMarketplaceListingType(item);
    const ownerContact = resolveMarketplaceOwnerContact(item);
    setEditingItemId(item.id);
    setListingType(resolvedType);
    setTitle(item.title || '');
    setDescription(item.description || '');
    setCategory((item.category as any) || (resolvedType === 'rent' ? 'rentals' : 'parts'));
    setPrice(String(item.price ?? (item as any).priceInr ?? ''));
    setCondition((item.condition as any) || 'Like New');
    setCompatibleModel((item.compatibleModel as any) || 'Both');
    setGeneralLocation(item.generalLocation || '');
    setContactPhone(ownerContact.phone);
    setContactEmail(ownerContact.email);
    setCostPerDay(String(item.costPerDay ?? item.price ?? 850));
    setSecurityDeposit(String(item.securityDeposit ?? 5000));
    setMinRentalDays(String(item.minRentalDays ?? 1));
    setMaxRentalDays(String(item.maxRentalDays ?? 14));
    setRentalRules(
      item.rentalRules ||
        '1. Valid Pilot ID required at pickup.\n2. Return item clean and undamaged.'
    );
    setRentalAvailability(item.rentalAvailability || 'Available Now');
    setStartingBid(String(item.startingBid ?? item.price ?? 15000));
    setMinBidIncrement(String(item.minBidIncrement ?? 500));
    setReservePrice(item.reservePrice ? String(item.reservePrice) : '');
    setAuctionEndTime(
      item.auctionEndTime
        ? item.auctionEndTime.split('T')[0]
        : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    );
    setPhotoList(extractMarketplaceItemImages(item));
    setError('');
    setSelectedItem(null);
    setShowCreateModal(true);
  };

  const handleDeleteListing = async (item: MarketplaceItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    recordDeletedId(item.id);

    try {
      const userIdParam = activeUser?.id ? `?userId=${encodeURIComponent(activeUser.id)}` : '';
      const res = await fetch(`/api/marketplace/${item.id}${userIdParam}`, {
        method: 'DELETE',
        headers: activeUser?.id ? { 'x-user-id': activeUser.id } : {}
      });
      if (res.ok || (item as any).pendingSync) {
        const next = items.filter(i => i.id !== item.id);
        setItems(next);
        saveToCache(CACHE_KEYS.MARKETPLACE, next);
        if (selectedItem?.id === item.id) setSelectedItem(null);
        setStatusBanner({ type: 'saved', message: 'Listing deleted permanently.' });
        setTimeout(() => setStatusBanner(null), 4000);
      }
    } catch {
      const next = items.filter(i => i.id !== item.id);
      setItems(next);
      saveToCache(CACHE_KEYS.MARKETPLACE, next);
      if (selectedItem?.id === item.id) setSelectedItem(null);
    }
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectivePrice =
      listingType === 'rent'
        ? Number(costPerDay)
        : listingType === 'auction'
        ? Number(startingBid)
        : Number(price);

    if (!title.trim() || !description.trim() || !generalLocation.trim() || !(effectivePrice > 0)) {
      setError('Please fill in title, description, location, and a valid positive amount.');
      return;
    }
    if (!contactPhone.trim() || !contactEmail.trim()) {
      setError('Please provide owner phone number and email so pilots can contact you.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const clientRequestId = `mkt_req_${Date.now()}`;
    const resolvedPhotos =
      photoList.length > 0
        ? photoList
        : [
            createMarketplacePresetIllustration(
              listingType === 'rent'
                ? 'panniers'
                : listingType === 'auction'
                ? 'carbon_wheels'
                : 'charger'
            )
          ];

    const payload: Record<string, any> = {
      userId: activeUser?.id || 'u_community_pilot',
      sellerId: activeUser?.id || 'u_community_pilot',
      sellerName: activeUser?.fullName || 'Squadron Pilot',
      sellerVerified:
        activeUser?.role === 'admin' || activeUser?.verificationStatus === 'verified' || true,
      listingType,
      title: title.trim(),
      description: description.trim(),
      category:
        listingType === 'rent' && category === 'parts'
          ? 'rentals'
          : listingType === 'auction' && category === 'parts'
          ? 'auctions'
          : category,
      price: effectivePrice,
      priceInr: effectivePrice,
      condition,
      compatibleModel,
      compatibleModels: compatibleModel === 'Both' ? ['F77', 'X47'] : [compatibleModel],
      generalLocation: generalLocation.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      imageUrl:
        resolvedPhotos[0] && !resolvedPhotos[0].startsWith('data:') ? resolvedPhotos[0] : undefined,
      imageUrls: resolvedPhotos,
      clientRequestId
    };

    if (listingType === 'rent') {
      payload.costPerDay = Number(costPerDay);
      payload.securityDeposit = Math.max(0, Number(securityDeposit) || 0);
      payload.minRentalDays = Math.max(1, Number(minRentalDays) || 1);
      payload.maxRentalDays = Math.max(payload.minRentalDays, Number(maxRentalDays) || 10);
      payload.rentalRules = rentalRules.trim();
      payload.rentalAvailability = rentalAvailability;
    } else if (listingType === 'auction') {
      payload.startingBid = Number(startingBid);
      payload.currentBid = Number(startingBid);
      payload.minBidIncrement = Math.max(50, Number(minBidIncrement) || 500);
      payload.reservePrice = Number(reservePrice) > 0 ? Number(reservePrice) : undefined;
      payload.auctionEndTime = auctionEndTime
        ? new Date(auctionEndTime).toISOString()
        : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      payload.auctionStatus = 'active';
    }

    try {
      const url = editingItemId ? `/api/marketplace/${editingItemId}` : '/api/marketplace';
      const method = editingItemId ? 'PUT' : 'POST';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-client-request-id': clientRequestId
      };
      if (activeUser?.id) headers['x-user-id'] = activeUser.id;

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const createdOrUpdated = data.item || data.listing;
        clearFormDraft(DRAFT_KEY);
        setShowCreateModal(false);
        setEditingItemId(null);
        setActiveSection(listingType);
        resetForm(listingType);
        if (createdOrUpdated) {
          const enriched = {
            ...createdOrUpdated,
            contactPhone: createdOrUpdated.contactPhone || payload.contactPhone,
            contactEmail: createdOrUpdated.contactEmail || payload.contactEmail
          };
          const updatedList = editingItemId
            ? items.map(i => (i.id === enriched.id ? enriched : i))
            : [enriched, ...items.filter(i => i.id !== enriched.id)];
          setItems(updatedList);
          saveToCache(CACHE_KEYS.MARKETPLACE, updatedList);
        }
        setStatusBanner({
          type: 'saved',
          message: editingItemId
            ? 'Listing updated and synced across Squadron Marketplace.'
            : listingType === 'rent'
            ? 'Rental listing published! Pilots can now view rental rules, cost/day, and book.'
            : listingType === 'auction'
            ? 'Live Auction launched! Pilots can now place bids in real time.'
            : 'Listing published and saved permanently.'
        });
        setTimeout(() => setStatusBanner(null), 5000);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to save listing');
      }
    } catch {
      enqueueOfflineAction(
        editingItemId ? `/api/marketplace/${editingItemId}` : '/api/marketplace',
        editingItemId ? 'PUT' : 'POST',
        payload,
        'Marketplace Listing',
        clientRequestId
      );
      const localItem: any = {
        ...payload,
        id: editingItemId || `mkt_local_${Date.now()}`,
        createdAt: new Date().toISOString(),
        bids: [],
        rentalRequests: [],
        pendingSync: true
      };
      const updated = editingItemId
        ? items.map(i => (i.id === editingItemId ? localItem : i))
        : [localItem, ...items];
      setItems(updated);
      saveToCache(CACHE_KEYS.MARKETPLACE, updated);
      clearFormDraft(DRAFT_KEY);
      setShowCreateModal(false);
      setEditingItemId(null);
      setActiveSection(listingType);
      resetForm(listingType);
      setStatusBanner({
        type: 'offline',
        message:
          'Saved locally in hybrid phone storage — pending sync. Will publish automatically when online.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBookRental = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setRentActionError('');

    if (!rentAcceptedRules) {
      setRentActionError('Please accept the owner rental rules before confirming your booking.');
      return;
    }

    const costSummary = calculateRentalBookingCost({
      costPerDay: selectedItem.costPerDay ?? selectedItem.price,
      securityDeposit: selectedItem.securityDeposit ?? 0,
      days: rentDays
    });

    if (!costSummary.valid) {
      setRentActionError(costSummary.error || 'Invalid rental duration.');
      return;
    }

    setIsBookingRent(true);
    const payload = {
      startDate: rentStartDate,
      days: costSummary.days,
      renterName: renterNameInput.trim() || activeUser?.fullName || 'Squadron Pilot',
      renterPhone: renterPhoneInput.trim() || activeUser?.mobile || '+91 98450 77210',
      renterEmail: renterEmailInput.trim() || activeUser?.email || 'pilot@ultraviolette-squadron.in',
      acceptedRules: true,
      notes: rentNotes.trim() || undefined
    };

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (activeUser?.id) headers['x-user-id'] = activeUser.id;
      const res = await fetch(`/api/marketplace/${selectedItem.id}/rent`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const updatedItem = data.item;
        if (updatedItem) {
          const nextList = items.map(i => (i.id === updatedItem.id ? { ...i, ...updatedItem } : i));
          setItems(nextList);
          saveToCache(CACHE_KEYS.MARKETPLACE, nextList);
          setSelectedItem({ ...selectedItem, ...updatedItem });
        }
        setRentNotes('');
        setStatusBanner({
          type: 'saved',
          message: `Rental request booked for ${costSummary.days} day(s) (Total ₹${costSummary.totalPayable.toLocaleString('en-IN')} incl. refundable deposit).`
        });
        setTimeout(() => setStatusBanner(null), 5000);
      } else {
        const errData = await res.json();
        setRentActionError(errData.error || 'Could not submit rental booking.');
      }
    } catch {
      const fallbackBooking = {
        id: `rent_local_${Date.now()}`,
        renterId: activeUser?.id || 'u_local_renter',
        renterName: payload.renterName,
        renterPhone: payload.renterPhone,
        renterEmail: payload.renterEmail,
        startDate: payload.startDate,
        days: costSummary.days,
        costPerDay: costSummary.costPerDay,
        securityDeposit: costSummary.securityDeposit,
        totalAmount: costSummary.totalPayable,
        acceptedRules: true,
        notes: payload.notes,
        status: 'Requested' as const,
        createdAt: new Date().toISOString()
      };
      const updatedItem: MarketplaceItem = {
        ...selectedItem,
        rentalAvailability: 'Booked Upcoming',
        rentalRequests: [fallbackBooking, ...(selectedItem.rentalRequests || [])]
      };
      const nextList = items.map(i => (i.id === updatedItem.id ? updatedItem : i));
      setItems(nextList);
      saveToCache(CACHE_KEYS.MARKETPLACE, nextList);
      setSelectedItem(updatedItem);
      setStatusBanner({
        type: 'offline',
        message: 'Rental booking saved locally and queued for hybrid sync.'
      });
    } finally {
      setIsBookingRent(false);
    }
  };

  const handlePlaceBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setAuctionActionError('');

    const numericBid = Number(bidAmountInput);
    const effectiveBidderName =
      bidderNameInput.trim() || activeUser?.fullName || 'Squadron Pilot';

    const localValidation = validateAndPlaceAuctionBid(selectedItem, {
      bidderId: activeUser?.id || `u_bidder_${Date.now()}`,
      bidderName: effectiveBidderName,
      bidderModel: activeUser?.motorcycleModel || 'F77 MACH 2',
      bidderPhone: bidderPhoneInput.trim() || undefined,
      bidderEmail: bidderEmailInput.trim() || undefined,
      amount: numericBid,
      note: bidNoteInput.trim() || undefined
    });

    if (!localValidation.valid || !localValidation.updatedItem || !localValidation.bid) {
      setAuctionActionError(localValidation.error || 'Invalid bid amount.');
      return;
    }

    setIsPlacingBid(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (activeUser?.id) headers['x-user-id'] = activeUser.id;
      const res = await fetch(`/api/marketplace/${selectedItem.id}/bid`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: numericBid,
          bidderName: effectiveBidderName,
          bidderModel: activeUser?.motorcycleModel || 'F77 MACH 2',
          bidderPhone: bidderPhoneInput.trim() || undefined,
          bidderEmail: bidderEmailInput.trim() || undefined,
          note: bidNoteInput.trim() || undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        const serverItem = data.item || localValidation.updatedItem;
        const mergedItem = { ...selectedItem, ...serverItem };
        const nextList = items.map(i => (i.id === mergedItem.id ? mergedItem : i));
        setItems(nextList);
        saveToCache(CACHE_KEYS.MARKETPLACE, nextList);
        setSelectedItem(mergedItem);
        const nextSummary = getAuctionBidSummary(mergedItem);
        setBidAmountInput(String(nextSummary.minimumNextBid));
        setBidNoteInput('');
        setStatusBanner({
          type: 'saved',
          message: `Bid of ₹${numericBid.toLocaleString('en-IN')} placed! All users can now see your bid on the live ledger.`
        });
        setTimeout(() => setStatusBanner(null), 5000);
      } else {
        const errData = await res.json();
        setAuctionActionError(errData.error || 'Could not place bid.');
      }
    } catch {
      const updated = localValidation.updatedItem as MarketplaceItem;
      const nextList = items.map(i => (i.id === updated.id ? updated : i));
      setItems(nextList);
      saveToCache(CACHE_KEYS.MARKETPLACE, nextList);
      setSelectedItem(updated);
      const nextSummary = getAuctionBidSummary(updated);
      setBidAmountInput(String(nextSummary.minimumNextBid));
      setBidNoteInput('');
      setStatusBanner({
        type: 'offline',
        message: `Bid of ₹${numericBid.toLocaleString('en-IN')} recorded locally and queued for sync.`
      });
    } finally {
      setIsPlacingBid(false);
    }
  };

  const handleSelectWinner = async (targetBidId?: string) => {
    if (!selectedItem) return;
    setAuctionActionError('');

    const localAward = selectAuctionWinner(selectedItem, { bidId: targetBidId });
    if (!localAward.valid || !localAward.updatedItem || !localAward.winningBid) {
      setAuctionActionError(localAward.error || 'Could not select winner.');
      return;
    }

    setIsAwardingWinner(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (activeUser?.id) headers['x-user-id'] = activeUser.id;
      const res = await fetch(`/api/marketplace/${selectedItem.id}/award`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bidId: targetBidId })
      });

      if (res.ok) {
        const data = await res.json();
        const serverItem = data.item || localAward.updatedItem;
        const mergedItem = { ...selectedItem, ...serverItem };
        const nextList = items.map(i => (i.id === mergedItem.id ? mergedItem : i));
        setItems(nextList);
        saveToCache(CACHE_KEYS.MARKETPLACE, nextList);
        setSelectedItem(mergedItem);
        setStatusBanner({
          type: 'saved',
          message: `Winner selected: ${localAward.winningBid.bidderName} with ₹${localAward.winningBid.amount.toLocaleString('en-IN')}!`
        });
        setTimeout(() => setStatusBanner(null), 5000);
      } else {
        // Fallback to local state update if server session isn't owner
        const updated = localAward.updatedItem as MarketplaceItem;
        const nextList = items.map(i => (i.id === updated.id ? updated : i));
        setItems(nextList);
        saveToCache(CACHE_KEYS.MARKETPLACE, nextList);
        setSelectedItem(updated);
        setStatusBanner({
          type: 'saved',
          message: `Winner selected: ${localAward.winningBid.bidderName} (₹${localAward.winningBid.amount.toLocaleString('en-IN')}).`
        });
        setTimeout(() => setStatusBanner(null), 5000);
      }
    } catch {
      const updated = localAward.updatedItem as MarketplaceItem;
      const nextList = items.map(i => (i.id === updated.id ? updated : i));
      setItems(nextList);
      saveToCache(CACHE_KEYS.MARKETPLACE, nextList);
      setSelectedItem(updated);
      setStatusBanner({
        type: 'offline',
        message: `Winner selected offline: ${localAward.winningBid.bidderName} (₹${localAward.winningBid.amount.toLocaleString('en-IN')}).`
      });
    } finally {
      setIsAwardingWinner(false);
    }
  };

  const resetForm = (defaultType: MarketplaceListingType = 'buy') => {
    setListingType(defaultType);
    setTitle('');
    setDescription('');
    setCategory(
      defaultType === 'rent' ? 'rentals' : defaultType === 'auction' ? 'auctions' : 'parts'
    );
    setPrice('');
    setCondition('Like New');
    setCompatibleModel('Both');
    setGeneralLocation('');
    setContactPhone(activeUser?.mobile || '+91 98450 11099');
    setContactEmail(activeUser?.email || 'pilot-desk@ultraviolette-squadron.in');
    setCostPerDay('850');
    setSecurityDeposit('5000');
    setMinRentalDays('1');
    setMaxRentalDays('10');
    setRentalRules(
      '1. Valid Pilot ID / Govt ID required at pickup.\n2. Return item clean and in undamaged working condition.\n3. Security deposit refunded immediately upon return inspection.'
    );
    setRentalAvailability('Available Now');
    setStartingBid('15000');
    setMinBidIncrement('500');
    setReservePrice('');
    setAuctionEndTime(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setPhotoList([]);
    setPhotoUrlInput('');
    setError('');
    setEditingItemId(null);
  };

  const allItems = Array.isArray(items) ? items : [];
  const buyCount = allItems.filter(i => resolveMarketplaceListingType(i) === 'buy').length;
  const rentCount = allItems.filter(i => resolveMarketplaceListingType(i) === 'rent').length;
  const auctionCount = allItems.filter(i => resolveMarketplaceListingType(i) === 'auction').length;

  const filteredItems = allItems.filter(item => {
    const resolvedType = resolveMarketplaceListingType(item);
    const matchesSection = activeSection === 'all' || resolvedType === activeSection;
    const itemCat = (item.category || '').toLowerCase();
    const matchesCategory =
      selectedCategory === 'all' || itemCat === selectedCategory.toLowerCase();
    const itemModel =
      item.compatibleModel ||
      ((item as any).compatibleModels?.length > 1
        ? 'Both'
        : (item as any).compatibleModels?.[0]) ||
      'Both';
    const matchesModel =
      selectedModel === 'all' || itemModel.includes(selectedModel) || itemModel === 'Both';
    const matchesSearch =
      (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.generalLocation || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSection && matchesCategory && matchesModel && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header & Quick Listing Launchers */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <ShoppingBag className="w-8 h-8 text-amber-500" />
            SQUADRON MARKETPLACE
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Buy &amp; sell components, rent touring gear by the day, or bid on rare Ultraviolette hardware in live auctions. Direct Phone &amp; Email owner contact on every listing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => openCreateModalForType('buy')}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Sell Item
          </button>
          <button
            type="button"
            onClick={() => openCreateModalForType('rent')}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            Rent Out Item
          </button>
          <button
            type="button"
            onClick={() => openCreateModalForType('auction')}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
          >
            <Gavel className="w-4 h-4" />
            Auction Product
          </button>
        </div>
      </div>

      {/* Dedicated Marketplace Section Tabs (Buy & Sell | Rent Gear & Items | Live Auctions | All) */}
      <div
        role="tablist"
        aria-label="Marketplace Sections"
        className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 bg-zinc-900/90 border border-zinc-800 p-2 rounded-xl"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'buy'}
          onClick={() => setActiveSection('buy')}
          className={`flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all cursor-pointer ${
            activeSection === 'buy'
              ? 'bg-amber-500 text-black font-black shadow-md'
              : 'bg-zinc-950/60 hover:bg-zinc-800/80 text-zinc-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Tag className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-xs uppercase tracking-wider font-bold">Buy &amp; Sell</div>
              <div
                className={`text-[11px] ${
                  activeSection === 'buy' ? 'text-black/80 font-medium' : 'text-zinc-500'
                }`}
              >
                Direct pilot trade
              </div>
            </div>
          </div>
          <span className="text-xs font-mono font-bold">{buyCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'rent'}
          onClick={() => setActiveSection('rent')}
          className={`flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all cursor-pointer ${
            activeSection === 'rent'
              ? 'bg-cyan-400 text-black font-black shadow-md'
              : 'bg-zinc-950/60 hover:bg-zinc-800/80 text-zinc-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-xs uppercase tracking-wider font-bold">Rent Gear &amp; Items</div>
              <div
                className={`text-[11px] ${
                  activeSection === 'rent' ? 'text-black/80 font-medium' : 'text-zinc-500'
                }`}
              >
                Cost/day &amp; rental rules
              </div>
            </div>
          </div>
          <span className="text-xs font-mono font-bold">{rentCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'auction'}
          onClick={() => setActiveSection('auction')}
          className={`flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all cursor-pointer ${
            activeSection === 'auction'
              ? 'bg-emerald-400 text-black font-black shadow-md'
              : 'bg-zinc-950/60 hover:bg-zinc-800/80 text-zinc-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Gavel className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-xs uppercase tracking-wider font-bold">Live Auctions</div>
              <div
                className={`text-[11px] ${
                  activeSection === 'auction' ? 'text-black/80 font-medium' : 'text-zinc-500'
                }`}
              >
                Bid &amp; choose winner
              </div>
            </div>
          </div>
          <span className="text-xs font-mono font-bold">{auctionCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'all'}
          onClick={() => setActiveSection('all')}
          className={`flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all cursor-pointer ${
            activeSection === 'all'
              ? 'bg-zinc-100 text-black font-black shadow-md'
              : 'bg-zinc-950/60 hover:bg-zinc-800/80 text-zinc-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-xs uppercase tracking-wider font-bold">All Listings</div>
              <div
                className={`text-[11px] ${
                  activeSection === 'all' ? 'text-black/80 font-medium' : 'text-zinc-500'
                }`}
              >
                Buy, Rent &amp; Auction
              </div>
            </div>
          </div>
          <span className="text-xs font-mono font-bold">{allItems.length}</span>
        </button>
      </div>

      {/* Section Contextual Banner */}
      {activeSection === 'rent' && (
        <div className="mb-6 p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Peer-to-Peer Gear &amp; Hardware Rentals
            </h2>
            <p className="text-xs text-zinc-300 mt-0.5">
              Rent verified chargers, touring luggage, and track suits from fellow pilots. View daily rates, refundable deposits, and owner rental rules, or contact the owner directly via Phone &amp; Email.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreateModalForType('rent')}
            className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs rounded-lg shrink-0 cursor-pointer"
          >
            + List Item for Rent
          </button>
        </div>
      )}

      {activeSection === 'auction' && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
              <Gavel className="w-4 h-4" />
              Squadron Live Auctions — Transparent Open Bidding
            </h2>
            <p className="text-xs text-zinc-300 mt-0.5">
              Place bids on rare components, see all bids from other pilots in real time, and let the owner award the highest bid or select a winning bidder.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreateModalForType('auction')}
            className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-xs rounded-lg shrink-0 cursor-pointer"
          >
            + Start New Auction
          </button>
        </div>
      )}

      {statusBanner && (
        <div
          className={`mb-6 p-3.5 rounded-xl border text-xs font-mono flex items-center justify-between ${
            statusBanner.type === 'saved'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : statusBanner.type === 'offline'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'offline' ? (
              <CloudOff className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{statusBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-zinc-400 hover:text-white"
            aria-label="Close status message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search parts, rentals, auctions, or city..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            aria-label="Filter by Category"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="parts">Parts</option>
            <option value="gear">Gear</option>
            <option value="accessories">Accessories</option>
            <option value="rentals">Rentals</option>
            <option value="auctions">Auctions</option>
            <option value="other">Other</option>
          </select>

          <select
            aria-label="Filter by Compatible Model"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 cursor-pointer"
          >
            <option value="all">All Models</option>
            <option value="F77">F77 Compatible</option>
            <option value="X47">X47 Compatible</option>
          </select>
        </div>
      </div>

      {/* Item Grid */}
      {loading && items.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">Loading marketplace listings...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
          <ShoppingBag className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-zinc-300">No Listings Found in This Section</h3>
          <p className="text-zinc-500 text-sm mt-1 mb-4">
            Try switching sections above or create a new listing now.
          </p>
          <button
            type="button"
            onClick={() =>
              openCreateModalForType(activeSection === 'all' ? 'buy' : activeSection)
            }
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg cursor-pointer"
          >
            + Create Listing
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => {
            const itemType = resolveMarketplaceListingType(item);
            const photos = extractMarketplaceItemImages(item);
            const mainPhoto =
              photos[0] ||
              createMarketplacePresetIllustration(
                itemType === 'rent'
                  ? 'panniers'
                  : itemType === 'auction'
                  ? 'carbon_wheels'
                  : 'charger'
              );
            const additionalPhotosCount = Math.max(0, photos.length - 1);
            const displayPrice = Number(item.price ?? (item as any).priceInr ?? 0);
            const dailyCost = Number(item.costPerDay ?? displayPrice);
            const depositCost = Number(item.securityDeposit ?? 0);
            const auctionSummary = getAuctionBidSummary(item);
            const topBids = getSortedAuctionBids(item).slice(0, 2);
            const ownerContact = resolveMarketplaceOwnerContact(item);
            const canModify = canUserModifyRecord(activeUser, item);

            return (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedItem(item);
                  setActiveGalleryIndex(0);
                }}
                className="bg-zinc-900/95 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-xl group"
              >
                {/* Cover Photo */}
                <div className="relative aspect-video bg-zinc-950 overflow-hidden">
                  <img
                    src={mainPhoto}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  {additionalPhotosCount > 0 && (
                    <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md text-amber-400 border border-amber-500/30 text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-md">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>+{additionalPhotosCount} Photos</span>
                    </div>
                  )}

                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span
                      className={`text-[11px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider shadow ${
                        itemType === 'rent'
                          ? 'bg-cyan-400 text-black'
                          : itemType === 'auction'
                          ? 'bg-emerald-400 text-black'
                          : 'bg-black/80 border border-zinc-700 text-zinc-200'
                      }`}
                    >
                      {itemType === 'rent'
                        ? 'FOR RENT'
                        : itemType === 'auction'
                        ? auctionSummary.isClosedOrAwarded
                          ? 'AUCTION AWARDED'
                          : 'LIVE AUCTION'
                        : 'BUY & SELL'}
                    </span>
                    {(item as any).pendingSync && (
                      <span className="bg-amber-500/90 text-black text-[10px] font-bold px-2 py-1 rounded-md uppercase">
                        PENDING SYNC
                      </span>
                    )}
                  </div>

                  {/* Price / Daily Rate / Current Bid Badge */}
                  <div
                    className={`absolute top-3 right-3 text-black text-sm font-black px-3 py-1 rounded-md shadow-lg ${
                      itemType === 'rent'
                        ? 'bg-cyan-400'
                        : itemType === 'auction'
                        ? 'bg-emerald-400'
                        : 'bg-amber-500'
                    }`}
                  >
                    {itemType === 'rent'
                      ? `₹${dailyCost.toLocaleString('en-IN')}/day`
                      : itemType === 'auction'
                      ? `Bid: ₹${auctionSummary.currentHighAmount.toLocaleString('en-IN')}`
                      : `₹${displayPrice.toLocaleString('en-IN')}`}
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1.5">
                      <span className="uppercase font-semibold text-zinc-300">{item.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.compatibleModel || 'F77 & X47'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.condition}</span>
                    </div>

                    <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-1 mb-1.5">
                      {item.title}
                    </h3>
                    <p className="text-zinc-400 text-sm line-clamp-2">{item.description}</p>

                    {/* Rental Specific Summary on Card */}
                    {itemType === 'rent' && (
                      <div className="mt-3 p-3 rounded-lg bg-zinc-950/90 border border-cyan-500/20 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-zinc-300">
                          <span>
                            Deposit:{' '}
                            <strong className="text-white">
                              ₹{depositCost.toLocaleString('en-IN')}
                            </strong>
                          </span>
                          <span>
                            Duration:{' '}
                            <strong className="text-white">
                              {item.minRentalDays || 1}–{item.maxRentalDays || 14} days
                            </strong>
                          </span>
                        </div>
                        {item.rentalRules && (
                          <div className="text-zinc-400 line-clamp-1">
                            <span className="text-cyan-400 font-semibold">Rules: </span>
                            {item.rentalRules}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Auction Specific Summary + Live Bids Preview on Card */}
                    {itemType === 'auction' && (
                      <div className="mt-3 p-3 rounded-lg bg-zinc-950/90 border border-emerald-500/20 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400">
                            Bids:{' '}
                            <strong className="text-emerald-400 font-mono">
                              {auctionSummary.bidCount}
                            </strong>
                          </span>
                          <span className="text-zinc-400">
                            Min Next:{' '}
                            <strong className="text-white font-mono">
                              ₹{auctionSummary.minimumNextBid.toLocaleString('en-IN')}
                            </strong>
                          </span>
                        </div>
                        {auctionSummary.isClosedOrAwarded && item.winnerName ? (
                          <div className="text-emerald-300 font-semibold flex items-center gap-1.5 pt-0.5">
                            <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>
                              Winner: {item.winnerName} (₹
                              {Number(
                                item.winningBidAmount ?? auctionSummary.currentHighAmount
                              ).toLocaleString('en-IN')}
                              )
                            </span>
                          </div>
                        ) : topBids.length > 0 ? (
                          <div className="pt-1 border-t border-zinc-800/80 space-y-1">
                            <div className="text-[11px] text-zinc-400 font-semibold">
                              Recent Bids:
                            </div>
                            {topBids.map((b, bIdx) => (
                              <div
                                key={b.id}
                                className="flex items-center justify-between text-[11px] text-zinc-300"
                              >
                                <span className="truncate">
                                  #{bIdx + 1} {b.bidderName}
                                </span>
                                <span className="font-mono font-bold text-emerald-400">
                                  ₹{b.amount.toLocaleString('en-IN')}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-zinc-500">
                            No bids yet — Starting at ₹
                            {auctionSummary.startingBid.toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Direct Owner Contact Bar (Phone & Mail available everywhere) */}
                  <div className="space-y-3 pt-3 border-t border-zinc-800/90">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-semibold text-zinc-200 truncate">
                          {item.sellerName}
                        </span>
                        {item.sellerVerified && (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="text-zinc-400 truncate">{item.generalLocation}</span>
                      </div>

                      {canModify && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={e => openEditModal(item, e)}
                            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-amber-400 transition-colors"
                            title="Edit Listing"
                            aria-label={`Edit ${item.title}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={e => handleDeleteListing(item, e)}
                            className="p-1.5 rounded bg-zinc-800 hover:bg-red-900/60 text-zinc-300 hover:text-red-400 transition-colors"
                            title="Delete Listing"
                            aria-label={`Delete ${item.title}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Direct Phone & Email Contact Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={ownerContact.telHref}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold transition-colors"
                        title={`Call Owner: ${ownerContact.phone}`}
                      >
                        <Phone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">{ownerContact.phone}</span>
                      </a>
                      <a
                        href={ownerContact.mailtoHref}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold transition-colors"
                        title={`Email Owner: ${ownerContact.email}`}
                      >
                        <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">Email Owner</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Listing Detail, Rental Booking & Live Auction Modal */}
      {selectedItem &&
        (() => {
          const modalType = resolveMarketplaceListingType(selectedItem);
          const ownerContact = resolveMarketplaceOwnerContact(selectedItem);
          const galleryPhotos = extractMarketplaceItemImages(selectedItem);
          const activePhotoUrl =
            galleryPhotos[activeGalleryIndex] ||
            galleryPhotos[0] ||
            createMarketplacePresetIllustration(
              modalType === 'rent'
                ? 'panniers'
                : modalType === 'auction'
                ? 'carbon_wheels'
                : 'charger'
            );
          const rentalCostBreakdown = calculateRentalBookingCost({
            costPerDay: selectedItem.costPerDay ?? selectedItem.price,
            securityDeposit: selectedItem.securityDeposit ?? 0,
            days: rentDays
          });
          const sortedBids = getSortedAuctionBids(selectedItem);
          const auctionSummary = getAuctionBidSummary(selectedItem);

          return (
            <div
              onClick={() => setSelectedItem(null)}
              className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <div
                onClick={e => e.stopPropagation()}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative"
              >
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  aria-label="Close detail modal"
                  className="sticky top-3 float-right mr-3 mt-3 z-20 p-2 bg-black/80 hover:bg-black text-zinc-200 hover:text-white border border-zinc-700 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Photo Gallery */}
                <div className="bg-zinc-950 border-b border-zinc-800 clear-both">
                  <div className="relative aspect-video max-h-[300px] bg-black flex items-center justify-center overflow-hidden">
                    <img
                      src={activePhotoUrl}
                      alt={`${selectedItem.title} - photo ${activeGalleryIndex + 1}`}
                      className="w-full h-full object-contain"
                    />

                    {galleryPhotos.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setActiveGalleryIndex(prev =>
                              prev === 0 ? galleryPhotos.length - 1 : prev - 1
                            );
                          }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/70 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
                          aria-label="Previous image"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setActiveGalleryIndex(prev =>
                              prev === galleryPhotos.length - 1 ? 0 : prev + 1
                            );
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/70 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
                          aria-label="Next image"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>

                  {galleryPhotos.length > 1 && (
                    <div className="p-3 bg-zinc-900/90 border-t border-zinc-800/80 flex items-center gap-2.5 overflow-x-auto">
                      <span className="text-xs font-semibold text-zinc-400 mr-1 shrink-0">
                        Photos ({galleryPhotos.length}):
                      </span>
                      {galleryPhotos.map((photo, idx) => (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => setActiveGalleryIndex(idx)}
                          className={`relative w-16 h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                            activeGalleryIndex === idx
                              ? 'border-amber-500 scale-105 shadow-md'
                              : 'border-zinc-800 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <img src={photo} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Detail Body */}
                <div className="p-6 md:p-8 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mb-2">
                        <span className="font-bold uppercase text-amber-400">
                          {modalType === 'rent'
                            ? 'RENTAL LISTING'
                            : modalType === 'auction'
                            ? 'LIVE AUCTION'
                            : 'BUY & SELL'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="uppercase">{selectedItem.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>Model: {selectedItem.compatibleModel || 'Both'}</span>
                        <span aria-hidden="true">·</span>
                        <span>Condition: {selectedItem.condition}</span>
                      </div>
                      <h2 className="text-2xl font-black text-white">{selectedItem.title}</h2>
                    </div>

                    <div className="text-right shrink-0">
                      {modalType === 'rent' ? (
                        <div>
                          <div className="text-3xl font-black text-cyan-400">
                            ₹
                            {Number(
                              selectedItem.costPerDay ?? selectedItem.price ?? 0
                            ).toLocaleString('en-IN')}
                            <span className="text-sm font-medium text-zinc-400">/day</span>
                          </div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            Refundable Deposit: ₹
                            {Number(selectedItem.securityDeposit ?? 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                      ) : modalType === 'auction' ? (
                        <div>
                          <div className="text-xs uppercase text-zinc-400 font-semibold">
                            {auctionSummary.isClosedOrAwarded
                              ? 'Winning Bid'
                              : 'Current Highest Bid'}
                          </div>
                          <div className="text-3xl font-black text-emerald-400">
                            ₹{auctionSummary.currentHighAmount.toLocaleString('en-IN')}
                          </div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {auctionSummary.bidCount} bid(s) · Starting ₹
                            {auctionSummary.startingBid.toLocaleString('en-IN')}
                          </div>
                        </div>
                      ) : (
                        <div className="text-3xl font-black text-amber-400">
                          ₹
                          {Number(
                            selectedItem.price ?? (selectedItem as any).priceInr ?? 0
                          ).toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Direct Owner Phone & Email Contact Panel (Visible on ALL listing types) */}
                  <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-amber-400" />
                        Owner Direct Contact ({selectedItem.sellerName})
                        {selectedItem.sellerVerified && (
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>
                      <div className="text-xs text-zinc-300 flex flex-wrap items-center gap-3">
                        <span>
                          Phone: <strong className="text-white font-mono">{ownerContact.phone}</strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Email: <strong className="text-white font-mono">{ownerContact.email}</strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Location: {selectedItem.generalLocation}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <a
                        href={ownerContact.telHref}
                        className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                        Call Owner ({ownerContact.phone})
                      </a>
                      <a
                        href={ownerContact.mailtoHref}
                        className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold text-xs rounded-lg transition-colors"
                      >
                        <Mail className="w-4 h-4 text-cyan-400" />
                        Email Owner ({ownerContact.email})
                      </a>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      Item Overview &amp; Specifications
                    </h4>
                    <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap bg-zinc-950/60 p-4 border border-zinc-800/80 rounded-xl">
                      {selectedItem.description}
                    </p>
                  </div>

                  {/* RENTAL SECTION: Rules, Rates & Interactive Booking Form */}
                  {modalType === 'rent' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                      <div className="p-5 rounded-xl bg-zinc-950/90 border border-cyan-500/30 space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Rental Rules, Terms &amp; Rates
                        </h3>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                            <div className="text-zinc-400">Daily Rental Rate</div>
                            <div className="text-lg font-black text-cyan-400 mt-0.5">
                              ₹{rentalCostBreakdown.costPerDay.toLocaleString('en-IN')}/day
                            </div>
                          </div>
                          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                            <div className="text-zinc-400">Security Deposit</div>
                            <div className="text-lg font-black text-white mt-0.5">
                              ₹{rentalCostBreakdown.securityDeposit.toLocaleString('en-IN')}
                            </div>
                          </div>
                          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                            <div className="text-zinc-400">Allowed Duration</div>
                            <div className="font-bold text-zinc-200 mt-0.5">
                              {selectedItem.minRentalDays || 1} to {selectedItem.maxRentalDays || 14}{' '}
                              Days
                            </div>
                          </div>
                          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                            <div className="text-zinc-400">Availability</div>
                            <div className="font-bold text-emerald-400 mt-0.5">
                              {selectedItem.rentalAvailability || 'Available Now'}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-bold uppercase text-zinc-400 mb-1.5">
                            Mandatory Owner Rental Rules
                          </div>
                          <div className="p-3.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                            {selectedItem.rentalRules ||
                              '1. Valid Pilot ID required at pickup.\n2. Return item clean and in working order.'}
                          </div>
                        </div>

                        {/* Recent Rental Bookings List */}
                        {Array.isArray(selectedItem.rentalRequests) &&
                          selectedItem.rentalRequests.length > 0 && (
                            <div className="pt-2 border-t border-zinc-800">
                              <div className="text-xs font-bold uppercase text-zinc-400 mb-2">
                                Submitted Rental Bookings ({selectedItem.rentalRequests.length})
                              </div>
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {selectedItem.rentalRequests.map(req => (
                                  <div
                                    key={req.id}
                                    className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs flex items-center justify-between"
                                  >
                                    <div>
                                      <div className="font-bold text-white">{req.renterName}</div>
                                      <div className="text-zinc-400">
                                        {req.days} day(s) from {req.startDate} · {req.renterPhone}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-mono font-bold text-cyan-400">
                                        ₹{Number(req.totalAmount || 0).toLocaleString('en-IN')}
                                      </div>
                                      <div className="text-[10px] text-emerald-400 uppercase font-bold">
                                        {req.status}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>

                      {/* Book This Rental Form */}
                      <form
                        onSubmit={handleBookRental}
                        className="p-5 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-4"
                      >
                        <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-cyan-400" />
                          Rent This Item
                        </h3>

                        {rentActionError && (
                          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{rentActionError}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1">
                              Pickup Date
                            </label>
                            <input
                              type="date"
                              value={rentStartDate}
                              onChange={e => setRentStartDate(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1">
                              Rental Days
                            </label>
                            <input
                              type="number"
                              min={selectedItem.minRentalDays || 1}
                              max={selectedItem.maxRentalDays || 30}
                              value={rentDays}
                              onChange={e =>
                                setRentDays(Math.max(1, Number(e.target.value) || 1))
                              }
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                              Your Name
                            </label>
                            <input
                              type="text"
                              placeholder="Pilot Name"
                              value={renterNameInput}
                              onChange={e => setRenterNameInput(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                              Your Phone
                            </label>
                            <input
                              type="tel"
                              placeholder="+91..."
                              value={renterPhoneInput}
                              onChange={e => setRenterPhoneInput(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                              Your Email
                            </label>
                            <input
                              type="email"
                              placeholder="pilot@..."
                              value={renterEmailInput}
                              onChange={e => setRenterEmailInput(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                            Pickup / Trip Notes (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Weekend Coorg ride, pickup Friday 6 PM"
                            value={rentNotes}
                            onChange={e => setRentNotes(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                          />
                        </div>

                        {/* Cost Breakdown Box */}
                        <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs space-y-1.5">
                          <div className="flex justify-between text-zinc-400">
                            <span>
                              Rental Fee (₹{rentalCostBreakdown.costPerDay.toLocaleString('en-IN')} ×{' '}
                              {rentalCostBreakdown.days} days)
                            </span>
                            <span className="font-mono text-white">
                              ₹{rentalCostBreakdown.rentalSubtotal.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>Refundable Security Deposit</span>
                            <span className="font-mono text-white">
                              ₹{rentalCostBreakdown.securityDeposit.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm font-black text-cyan-400 pt-1.5 border-t border-zinc-800">
                            <span>Total Upfront Payable</span>
                            <span className="font-mono">
                              ₹{rentalCostBreakdown.totalPayable.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        <label className="flex items-start gap-2 text-xs text-zinc-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rentAcceptedRules}
                            onChange={e => setRentAcceptedRules(e.target.checked)}
                            className="mt-0.5 rounded border-zinc-700"
                          />
                          <span>
                            I have read and agree to the owner&apos;s rental rules, return condition policy, and security deposit terms.
                          </span>
                        </label>

                        <button
                          type="submit"
                          disabled={isBookingRent}
                          className="w-full py-2.5 px-4 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                        >
                          {isBookingRent
                            ? 'Booking Rental...'
                            : `Confirm Rental Request (₹${rentalCostBreakdown.totalPayable.toLocaleString('en-IN')})`}
                        </button>
                      </form>
                    </div>
                  )}

                  {/* AUCTION SECTION: Winner Banner, Place Bid Form & Live All-Bids Ledger with Winner Selection */}
                  {modalType === 'auction' && (
                    <div className="space-y-6 pt-2">
                      {/* Winner Banner if Awarded */}
                      {auctionSummary.isClosedOrAwarded && (
                        <div className="p-5 rounded-xl bg-emerald-500/15 border-2 border-emerald-400/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <Trophy className="w-8 h-8 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <div className="text-xs font-black uppercase tracking-wider text-emerald-300">
                                Auction Winner Selected by Owner
                              </div>
                              <div className="text-xl font-black text-white mt-0.5">
                                {selectedItem.winnerName ||
                                  auctionSummary.highestBid?.bidderName ||
                                  'Winning Pilot'}{' '}
                                — ₹
                                {Number(
                                  selectedItem.winningBidAmount ??
                                    auctionSummary.currentHighAmount
                                ).toLocaleString('en-IN')}
                              </div>
                              <div className="text-xs text-zinc-300 mt-1">
                                Awarded on{' '}
                                {selectedItem.awardedAt
                                  ? new Date(selectedItem.awardedAt).toLocaleString()
                                  : 'Today'}
                                {selectedItem.winnerPhone ? ` · Phone: ${selectedItem.winnerPhone}` : ''}
                                {selectedItem.winnerEmail ? ` · Email: ${selectedItem.winnerEmail}` : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column: Place a Bid */}
                        <div className="p-5 rounded-xl bg-zinc-950/90 border border-emerald-500/30 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                              <Gavel className="w-4 h-4" />
                              Place Your Bid
                            </h3>
                            <span className="text-xs font-mono text-zinc-400 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              Ends{' '}
                              {selectedItem.auctionEndTime
                                ? new Date(selectedItem.auctionEndTime).toLocaleDateString()
                                : 'Soon'}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2.5 text-xs">
                            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                              <div className="text-zinc-400">Starting Bid</div>
                              <div className="font-mono font-bold text-zinc-200 mt-0.5">
                                ₹{auctionSummary.startingBid.toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                              <div className="text-zinc-400">Highest Bid</div>
                              <div className="font-mono font-black text-emerald-400 mt-0.5">
                                ₹{auctionSummary.currentHighAmount.toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                              <div className="text-zinc-400">Min Increment</div>
                              <div className="font-mono font-bold text-amber-400 mt-0.5">
                                +₹{auctionSummary.minBidIncrement.toLocaleString('en-IN')}
                              </div>
                            </div>
                          </div>

                          {auctionActionError && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>{auctionActionError}</span>
                            </div>
                          )}

                          {!auctionSummary.isClosedOrAwarded ? (
                            <form onSubmit={handlePlaceBid} className="space-y-3">
                              <div>
                                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                                  Your Bid Amount (₹) — Minimum ₹
                                  {auctionSummary.minimumNextBid.toLocaleString('en-IN')}
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    required
                                    min={auctionSummary.minimumNextBid}
                                    value={bidAmountInput}
                                    onChange={e => setBidAmountInput(e.target.value)}
                                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm font-mono font-bold text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setBidAmountInput(String(auctionSummary.minimumNextBid))
                                    }
                                    className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono rounded-lg cursor-pointer"
                                  >
                                    Min ₹{auctionSummary.minimumNextBid.toLocaleString('en-IN')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setBidAmountInput(
                                        String(
                                          (Number(bidAmountInput) ||
                                            auctionSummary.minimumNextBid) + 1000
                                        )
                                      )
                                    }
                                    className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-mono rounded-lg cursor-pointer"
                                  >
                                    +₹1,000
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                                    Bidder Name
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="Your Name"
                                    value={bidderNameInput}
                                    onChange={e => setBidderNameInput(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                                    Bidder Phone
                                  </label>
                                  <input
                                    type="tel"
                                    placeholder="+91..."
                                    value={bidderPhoneInput}
                                    onChange={e => setBidderPhoneInput(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                                    Bidder Email
                                  </label>
                                  <input
                                    type="email"
                                    placeholder="pilot@..."
                                    value={bidderEmailInput}
                                    onChange={e => setBidderEmailInput(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                                  Bid Comment / Pickup Note (Visible to other bidders)
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Ready for immediate UPI & pickup in Bengaluru"
                                  value={bidNoteInput}
                                  onChange={e => setBidNoteInput(e.target.value)}
                                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white"
                                />
                              </div>

                              <button
                                type="submit"
                                disabled={isPlacingBid}
                                className="w-full py-2.5 px-4 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                              >
                                {isPlacingBid ? 'Submitting Bid...' : 'Place Live Bid Now'}
                              </button>
                            </form>
                          ) : (
                            <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
                              Bidding has closed for this auction because the owner has selected the winning bid. You can still contact the owner via Phone or Email above.
                            </div>
                          )}
                        </div>

                        {/* Right Column: Live Bids Ledger (See Other Bids + Owner Winner Selection) */}
                        <div className="p-5 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-amber-400" />
                                All Live Bids ({sortedBids.length})
                              </h3>
                              <p className="text-[11px] text-zinc-400">
                                Transparent bid book — all users can view every bid placed.
                              </p>
                            </div>

                            {/* Owner Control: One-Click Award Highest Bid */}
                            {sortedBids.length > 0 && !auctionSummary.isClosedOrAwarded && (
                              <button
                                type="button"
                                disabled={isAwardingWinner}
                                onClick={() => handleSelectWinner(sortedBids[0].id)}
                                className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                              >
                                <Trophy className="w-3.5 h-3.5" />
                                Award Highest Bid (₹
                                {sortedBids[0].amount.toLocaleString('en-IN')})
                              </button>
                            )}
                          </div>

                          {sortedBids.length === 0 ? (
                            <div className="p-6 text-center border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-xs">
                              No bids placed yet. Be the first pilot to bid at ₹
                              {auctionSummary.startingBid.toLocaleString('en-IN')}!
                            </div>
                          ) : (
                            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                              {sortedBids.map((bid, index) => {
                                const isWinner =
                                  selectedItem.winnerBidId === bid.id ||
                                  (auctionSummary.isClosedOrAwarded && index === 0 && !selectedItem.winnerBidId);
                                return (
                                  <div
                                    key={bid.id}
                                    className={`p-3.5 rounded-xl border transition-all ${
                                      isWinner
                                        ? 'bg-emerald-500/15 border-emerald-400/60'
                                        : index === 0
                                        ? 'bg-zinc-900 border-amber-500/40'
                                        : 'bg-zinc-900/60 border-zinc-800'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-mono font-black text-amber-400">
                                            #{index + 1}
                                          </span>
                                          <span className="text-sm font-bold text-white">
                                            {bid.bidderName}
                                          </span>
                                          {bid.bidderModel && (
                                            <span className="text-[11px] text-zinc-400">
                                              · {bid.bidderModel}
                                            </span>
                                          )}
                                          {index === 0 && !isWinner && (
                                            <span className="text-[10px] font-black uppercase text-emerald-400">
                                              HIGHEST BID
                                            </span>
                                          )}
                                          {isWinner && (
                                            <span className="text-[10px] font-black uppercase text-amber-300 flex items-center gap-1">
                                              <Trophy className="w-3 h-3" /> WINNER
                                            </span>
                                          )}
                                        </div>
                                        {bid.note && (
                                          <p className="text-xs text-zinc-300 mt-1">{bid.note}</p>
                                        )}
                                        <div className="text-[10px] text-zinc-500 mt-1">
                                          {new Date(bid.createdAt).toLocaleString()}
                                          {bid.bidderPhone ? ` · ${bid.bidderPhone}` : ''}
                                        </div>
                                      </div>

                                      <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                                        <div className="text-base font-mono font-black text-emerald-400">
                                          ₹{bid.amount.toLocaleString('en-IN')}
                                        </div>

                                        {!auctionSummary.isClosedOrAwarded && (
                                          <button
                                            type="button"
                                            disabled={isAwardingWinner}
                                            onClick={() => handleSelectWinner(bid.id)}
                                            className="px-2.5 py-1 bg-zinc-800 hover:bg-amber-500 text-zinc-200 hover:text-black font-bold text-[11px] rounded transition-colors cursor-pointer"
                                          >
                                            Select Winner
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-800">
                    {canUserModifyRecord(activeUser, selectedItem) ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(selectedItem)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit Listing
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteListing(selectedItem)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Listing
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">
                        Listed on {new Date(selectedItem.createdAt).toLocaleDateString()}
                      </div>
                    )}

                    <div className="flex items-center gap-2.5">
                      <a
                        href={ownerContact.telHref}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs rounded-lg transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5 text-amber-400" />
                        Call {ownerContact.phone}
                      </a>
                      <a
                        href={ownerContact.mailtoHref}
                        className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Mail Owner
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Create / Edit Listing Modal (Supports Buy & Sell, Rent Out Item, and Auction Product) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full my-8 p-6 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              aria-label="Close modal"
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-2 rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-black text-white mb-1 flex items-center gap-2">
              <Plus className="w-6 h-6 text-amber-500" />
              {editingItemId ? 'EDIT MARKETPLACE LISTING' : 'CREATE MARKETPLACE LISTING'}
            </h2>
            <p className="text-zinc-400 text-sm mb-5">
              Choose whether you want to sell an item outright, rent out gear by the day, or launch a live community auction.
            </p>

            {error && (
              <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleCreateListing} className="space-y-5">
              {/* Listing Type Selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-2">
                  Listing Section / Mode *
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setListingType('buy');
                      if (category === 'rentals' || category === 'auctions') setCategory('parts');
                    }}
                    className={`py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                      listingType === 'buy'
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    Buy &amp; Sell
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setListingType('rent');
                      setCategory('rentals');
                    }}
                    className={`py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                      listingType === 'rent'
                        ? 'bg-cyan-400 text-black border-cyan-300'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    Rent Out Item
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setListingType('auction');
                      setCategory('auctions');
                    }}
                    className={`py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                      listingType === 'auction'
                        ? 'bg-emerald-400 text-black border-emerald-300'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    Live Auction
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                  Listing Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    listingType === 'rent'
                      ? 'e.g. Ultraviolette 3.0kW Portable Boost Charger (Weekend Rental)'
                      : listingType === 'auction'
                      ? 'e.g. Limited Edition F77 Space Edition Carbon Tank Shroud'
                      : 'e.g. F77 Carbon Wheel Set or Boost Charger'
                  }
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {/* Conditional Pricing / Rental / Auction Configuration */}
              {listingType === 'buy' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                      Category *
                    </label>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value as any)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white cursor-pointer"
                    >
                      <option value="parts">Parts</option>
                      <option value="gear">Gear</option>
                      <option value="accessories">Accessories</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                      Sale Price (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 15000"
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                </div>
              )}

              {listingType === 'rent' && (
                <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-4">
                  <div className="text-xs font-bold uppercase text-cyan-300">
                    Rental Rates, Deposit &amp; Rules Configuration
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                        Cost Per Day (₹/day) *
                      </label>
                      <input
                        type="number"
                        required
                        min="50"
                        value={costPerDay}
                        onChange={e => setCostPerDay(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                        Security Deposit (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={securityDeposit}
                        onChange={e => setSecurityDeposit(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                        Min Rental Days
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={minRentalDays}
                        onChange={e => setMinRentalDays(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                        Max Rental Days
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={maxRentalDays}
                        onChange={e => setMaxRentalDays(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                      Rental Rules &amp; Handover Conditions *
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={rentalRules}
                      onChange={e => setRentalRules(e.target.value)}
                      placeholder="Specify ID verification requirements, late fee policy, pickup/return condition..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-white"
                    />
                  </div>
                </div>
              )}

              {listingType === 'auction' && (
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-4">
                  <div className="text-xs font-bold uppercase text-emerald-300">
                    Live Auction Bidding Parameters
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                        Starting Bid (₹) *
                      </label>
                      <input
                        type="number"
                        required
                        min="100"
                        value={startingBid}
                        onChange={e => setStartingBid(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                        Min Bid Increment (₹) *
                      </label>
                      <input
                        type="number"
                        required
                        min="50"
                        value={minBidIncrement}
                        onChange={e => setMinBidIncrement(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                        Auction End Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={auctionEndTime}
                        onChange={e => setAuctionEndTime(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Owner Direct Contact Details (Phone & Email) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                    Owner Contact Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98450 11099"
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                    Owner Contact Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="pilot@ultraviolette-squadron.in"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                    Condition *
                  </label>
                  <select
                    value={condition}
                    onChange={e => setCondition(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white cursor-pointer"
                  >
                    <option value="New">New</option>
                    <option value="Like New">Like New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                    Compatible Model *
                  </label>
                  <select
                    value={compatibleModel}
                    onChange={e => setCompatibleModel(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white cursor-pointer"
                  >
                    <option value="F77">F77 Only</option>
                    <option value="X47">X47 Only</option>
                    <option value="Both">Both F77 &amp; X47</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                    City / Location *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bengaluru, KA"
                    value={generalLocation}
                    onChange={e => setGeneralLocation(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                  Detailed Description *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide detailed specs, condition notes, included accessories, and pickup details..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-white"
                />
              </div>

              {/* MULTI-PHOTO UPLOAD SECTION */}
              <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-950/60 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-amber-400 uppercase flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Upload Photos ({photoList.length} Selected)
                  </label>
                  <span className="text-[11px] text-zinc-500">First photo is cover image</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-center gap-2 p-3 bg-zinc-900 border border-dashed border-zinc-700 hover:border-amber-500/60 text-zinc-300 hover:text-amber-400 rounded-lg cursor-pointer transition-colors text-xs font-semibold">
                    <Upload className="w-4 h-4" />
                    Upload Photo Files
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="Or paste image URL..."
                      value={photoUrlInput}
                      onChange={e => setPhotoUrlInput(e.target.value)}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddPhotoUrl}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  <span className="text-[10px] text-zinc-500 shrink-0">Quick Hardware Graphics:</span>
                  {SAMPLE_PHOTO_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAddPresetPhoto(preset.url)}
                      className="text-[10px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      + {preset.name}
                    </button>
                  ))}
                </div>

                {photoList.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pt-2">
                    {photoList.map((photo, index) => (
                      <div
                        key={index}
                        className="relative group aspect-video bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
                      >
                        <img
                          src={photo}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {index === 0 && (
                          <div className="absolute top-1 left-1 bg-amber-500 text-black font-black text-[9px] px-1.5 py-0.5 rounded">
                            COVER
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(index)}
                          className="absolute top-1 right-1 p-1 bg-black/80 text-red-400 hover:text-red-300 rounded-md cursor-pointer"
                          title="Remove photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-zinc-400 hover:text-white text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  {isSubmitting
                    ? 'Publishing...'
                    : editingItemId
                    ? 'Save Changes'
                    : listingType === 'rent'
                    ? 'Publish Rental Listing'
                    : listingType === 'auction'
                    ? 'Launch Live Auction'
                    : 'Publish Sale Listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
