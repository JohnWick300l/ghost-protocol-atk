import React, { useState, useEffect } from 'react';
import {
  Plus,
  ThumbsUp,
  Shield,
  Check,
  Search,
  Pin,
  MessageCircle,
  HelpCircle,
  CheckCircle2,
  CornerDownRight,
  Edit2,
  Trash2,
  CloudOff,
  X,
  BarChart3,
  Vote,
  FileSignature,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { DiscussionPost, DiscussionPoll, DiscussionPetition } from '../types';
import { BackButton } from './BackButton';
import {
  validatePollCreation,
  castPollVote,
  calculatePollResults,
  validatePetitionCreation,
  togglePetitionSupport,
  calculatePetitionProgress
} from '../utils/rules';
import {
  CACHE_KEYS,
  saveToCache,
  loadFromCache,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  enqueueOfflineAction,
  canUserModifyRecord,
  reconcileCollectionWithCache,
  recordDeletedId,
  OFFLINE_SYNC_EVENT
} from '../utils/telemetryCache';
import { AvionicsToggleTransition, motion } from './AvionicsTransition';

const DRAFT_KEY = 'discussions_question_form';
const VOTER_TOKEN_STORAGE_KEY = 'ghost_poll_voter_id_v1';

function getOrCreateLocalVoterId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = window.localStorage.getItem(VOTER_TOKEN_STORAGE_KEY);
      if (existing && existing.trim()) return existing.trim();
      const created = `pilot_voter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(VOTER_TOKEN_STORAGE_KEY, created);
      return created;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'pilot_voter_session';
}

export const Discussions: React.FC = () => {
  const { currentUser } = useAuth();
  const { playTacticalClick, playChime, reducedMotion } = useAudio();

  const [voterToken] = useState<string>(() => getOrCreateLocalVoterId());
  const effectiveVoterId = currentUser?.id || voterToken;

  const [discussions, setDiscussions] = useState<DiscussionPost[]>(() =>
    loadFromCache<DiscussionPost[]>(CACHE_KEYS.DISCUSSIONS, [])
  );
  const [polls, setPolls] = useState<DiscussionPoll[]>(() =>
    loadFromCache<DiscussionPoll[]>(CACHE_KEYS.POLLS, [])
  );
  const [petitions, setPetitions] = useState<DiscussionPetition[]>(() =>
    loadFromCache<DiscussionPetition[]>(CACHE_KEYS.PETITIONS, [])
  );
  const [selectedPost, setSelectedPost] = useState<DiscussionPost | null>(() => {
    const cached = loadFromCache<DiscussionPost[]>(CACHE_KEYS.DISCUSSIONS, []);
    return cached[0] || null;
  });

  const [activeSectionView, setActiveSectionView] = useState<'all' | 'threads' | 'polls' | 'petitions'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreatePollModal, setShowCreatePollModal] = useState(false);
  const [showCreatePetitionModal, setShowCreatePetitionModal] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [statusNotice, setStatusNotice] = useState<{ type: 'saved' | 'offline'; text: string } | null>(null);

  // Poll creation form state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollCategory, setPollCategory] = useState('General Discussion');
  const [pollAuthorName, setPollAuthorName] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollError, setPollError] = useState<string | null>(null);

  // Petition creation form state
  const [petitionTitle, setPetitionTitle] = useState('');
  const [petitionDescription, setPetitionDescription] = useState('');
  const [petitionCategory, setPetitionCategory] = useState('General Discussion');
  const [petitionTargetGoal, setPetitionTargetGoal] = useState<number>(25);
  const [petitionAuthorName, setPetitionAuthorName] = useState('');
  const [petitionError, setPetitionError] = useState<string | null>(null);

  const initialDraft = loadFormDraft(DRAFT_KEY, {
    title: '',
    category: 'General Discussion' as DiscussionPost['category'],
    content: '',
    tagsInput: ''
  });

  // Discussion Thread Form State
  const [title, setTitle] = useState(initialDraft.title);
  const [category, setCategory] = useState<DiscussionPost['category']>(initialDraft.category);
  const [content, setContent] = useState(initialDraft.content);
  const [tagsInput, setTagsInput] = useState(initialDraft.tagsInput);

  useEffect(() => {
    if (!editingPostId && (title || content || tagsInput)) {
      saveFormDraft(DRAFT_KEY, {
        title,
        category,
        content,
        tagsInput
      });
    }
  }, [editingPostId, title, category, content, tagsInput]);

  useEffect(() => {
    fetchDiscussions();
    const handleSync = () => fetchDiscussions();
    window.addEventListener(OFFLINE_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(OFFLINE_SYNC_EVENT, handleSync);
  }, []);

  const fetchDiscussions = async () => {
    try {
      const res = await fetch('/api/discussions');
      if (res.ok) {
        const data = await res.json();
        const serverPosts: DiscussionPost[] = data.discussions || [];
        const merged = reconcileCollectionWithCache<DiscussionPost>(CACHE_KEYS.DISCUSSIONS, serverPosts);
        setDiscussions(merged);
        saveToCache(CACHE_KEYS.DISCUSSIONS, merged);
        if (merged.length > 0) {
          setSelectedPost(prev => {
            if (!prev) return merged[0];
            return merged.find(d => d.id === prev.id) || merged[0];
          });
        }

        if (Array.isArray(data.polls)) {
          const mergedPolls = reconcileCollectionWithCache<DiscussionPoll>(CACHE_KEYS.POLLS, data.polls);
          setPolls(mergedPolls);
          saveToCache(CACHE_KEYS.POLLS, mergedPolls);
        }

        if (Array.isArray(data.petitions)) {
          const mergedPetitions = reconcileCollectionWithCache<DiscussionPetition>(
            CACHE_KEYS.PETITIONS,
            data.petitions
          );
          setPetitions(mergedPetitions);
          saveToCache(CACHE_KEYS.PETITIONS, mergedPetitions);
        }
      }
    } catch {
      const cached = loadFromCache<DiscussionPost[]>(CACHE_KEYS.DISCUSSIONS, []);
      if (cached.length > 0) setDiscussions(cached);
      const cachedPolls = loadFromCache<DiscussionPoll[]>(CACHE_KEYS.POLLS, []);
      if (cachedPolls.length > 0) setPolls(cachedPolls);
      const cachedPetitions = loadFromCache<DiscussionPetition[]>(CACHE_KEYS.PETITIONS, []);
      if (cachedPetitions.length > 0) setPetitions(cachedPetitions);
    }
  };

  const handleAddPollOptionField = () => {
    if (pollOptions.length >= 6) return;
    playTacticalClick();
    setPollOptions([...pollOptions, '']);
  };

  const handleRemovePollOptionField = (index: number) => {
    if (pollOptions.length <= 2) return;
    playTacticalClick();
    setPollOptions(pollOptions.filter((_, idx) => idx !== index));
  };

  const handlePollOptionChange = (index: number, value: string) => {
    const next = [...pollOptions];
    next[index] = value;
    setPollOptions(next);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    setPollError(null);

    const resolvedAuthorName =
      currentUser?.fullName || pollAuthorName.trim() || 'Squadron Pilot';
    const resolvedAuthorModel = currentUser?.motorcycleModel || 'F77 MACH 2';

    const validation = validatePollCreation({
      question: pollQuestion,
      category: pollCategory,
      options: pollOptions,
      authorName: resolvedAuthorName,
      authorModel: resolvedAuthorModel
    });

    if (!validation.valid || !validation.value) {
      setPollError(validation.error || 'Please check your poll question and options.');
      return;
    }

    playTacticalClick();
    const clientRequestId = `poll_req_${Date.now()}`;
    const payload = {
      question: validation.value.question,
      category: validation.value.category,
      options: validation.value.options,
      authorName: validation.value.authorName,
      authorModel: validation.value.authorModel,
      voterId: effectiveVoterId,
      clientRequestId
    };

    try {
      const res = await fetch('/api/discussions/polls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-request-id': clientRequestId
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.poll) {
          playChime();
          const updatedPolls = [data.poll, ...polls.filter(p => p.id !== data.poll.id)];
          setPolls(updatedPolls);
          saveToCache(CACHE_KEYS.POLLS, updatedPolls);
          setShowCreatePollModal(false);
          setPollQuestion('');
          setPollOptions(['', '']);
          setPollError(null);
          setStatusNotice({
            type: 'saved',
            text: 'Poll published to Discussion Polls. Other pilots can now vote!'
          });
          setTimeout(() => setStatusNotice(null), 4000);
          return;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setPollError(errData.error || 'Unable to publish poll.');
        return;
      }
    } catch {
      const nowTs = Date.now();
      const localPoll: DiscussionPoll = {
        id: `poll_local_${nowTs}`,
        clientRequestId,
        authorId: effectiveVoterId,
        authorName: validation.value.authorName,
        authorModel: validation.value.authorModel,
        question: validation.value.question,
        category: validation.value.category,
        options: validation.value.options.map((text, idx) => ({
          id: `opt_${nowTs}_${idx + 1}`,
          text,
          votes: []
        })),
        createdAt: new Date().toISOString()
      };
      enqueueOfflineAction(
        '/api/discussions/polls',
        'POST',
        payload,
        'Community Poll',
        clientRequestId
      );
      const updatedPolls = [localPoll, ...polls];
      setPolls(updatedPolls);
      saveToCache(CACHE_KEYS.POLLS, updatedPolls);
      setShowCreatePollModal(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setStatusNotice({
        type: 'offline',
        text: 'Poll saved locally — will sync when online.'
      });
    }
  };

  const handleVotePoll = async (pollId: string, optionId: string) => {
    playTacticalClick();
    const targetPoll = polls.find(p => p.id === pollId);
    if (!targetPoll) return;

    const optimisticPoll = castPollVote(targetPoll, optionId, effectiveVoterId);
    const optimisticList = polls.map(p => (p.id === pollId ? optimisticPoll : p));
    setPolls(optimisticList);
    saveToCache(CACHE_KEYS.POLLS, optimisticList);

    try {
      const res = await fetch(`/api/discussions/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId,
          voterId: effectiveVoterId
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.poll) {
          playChime();
          const syncedList = polls.map(p => (p.id === pollId ? data.poll : p));
          setPolls(syncedList);
          saveToCache(CACHE_KEYS.POLLS, syncedList);
        }
      }
    } catch {
      // Optimistic vote already saved in cache
    }
  };

  const handleDeletePoll = async (poll: DiscussionPoll) => {
    playTacticalClick();
    recordDeletedId(poll.id);
    const next = polls.filter(p => p.id !== poll.id);
    setPolls(next);
    saveToCache(CACHE_KEYS.POLLS, next);

    try {
      await fetch(`/api/discussions/polls/${poll.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterId: effectiveVoterId })
      });
      setStatusNotice({ type: 'saved', text: 'Poll removed.' });
      setTimeout(() => setStatusNotice(null), 3500);
    } catch {
      // Already removed locally
    }
  };

  const handleCreatePetition = async (e: React.FormEvent) => {
    e.preventDefault();
    setPetitionError(null);

    const resolvedAuthorName =
      currentUser?.fullName || petitionAuthorName.trim() || 'Squadron Pilot';
    const resolvedAuthorModel = currentUser?.motorcycleModel || 'F77 MACH 2';

    const validation = validatePetitionCreation({
      title: petitionTitle,
      description: petitionDescription,
      category: petitionCategory,
      targetGoal: petitionTargetGoal,
      authorName: resolvedAuthorName,
      authorModel: resolvedAuthorModel
    });

    if (!validation.valid || !validation.value) {
      setPetitionError(validation.error || 'Please check your petition details.');
      return;
    }

    playTacticalClick();
    const clientRequestId = `pet_req_${Date.now()}`;
    const payload = {
      title: validation.value.title,
      description: validation.value.description,
      category: validation.value.category,
      targetGoal: validation.value.targetGoal,
      authorName: validation.value.authorName,
      authorModel: validation.value.authorModel,
      voterId: effectiveVoterId,
      clientRequestId
    };

    try {
      const res = await fetch('/api/discussions/petitions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-request-id': clientRequestId
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.petition) {
          playChime();
          const updatedPetitions = [
            data.petition,
            ...petitions.filter(p => p.id !== data.petition.id)
          ];
          setPetitions(updatedPetitions);
          saveToCache(CACHE_KEYS.PETITIONS, updatedPetitions);
          setShowCreatePetitionModal(false);
          setPetitionTitle('');
          setPetitionDescription('');
          setPetitionTargetGoal(25);
          setPetitionError(null);
          setStatusNotice({
            type: 'saved',
            text: 'Petition published! Other squadron pilots can now support your petition.'
          });
          setTimeout(() => setStatusNotice(null), 4000);
          return;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setPetitionError(errData.error || 'Unable to publish petition.');
        return;
      }
    } catch {
      const nowIso = new Date().toISOString();
      const localPetition: DiscussionPetition = {
        id: `pet_local_${Date.now()}`,
        clientRequestId,
        authorId: effectiveVoterId,
        authorName: validation.value.authorName,
        authorModel: validation.value.authorModel,
        title: validation.value.title,
        description: validation.value.description,
        category: validation.value.category,
        targetGoal: validation.value.targetGoal,
        supporters: [
          {
            voterId: effectiveVoterId,
            supporterName: validation.value.authorName,
            supporterModel: validation.value.authorModel,
            supportedAt: nowIso
          }
        ],
        createdAt: nowIso
      };
      enqueueOfflineAction(
        '/api/discussions/petitions',
        'POST',
        payload,
        'Community Petition',
        clientRequestId
      );
      const updatedPetitions = [localPetition, ...petitions];
      setPetitions(updatedPetitions);
      saveToCache(CACHE_KEYS.PETITIONS, updatedPetitions);
      setShowCreatePetitionModal(false);
      setPetitionTitle('');
      setPetitionDescription('');
      setStatusNotice({
        type: 'offline',
        text: 'Petition saved locally — will sync when online.'
      });
    }
  };

  const handleSupportPetition = async (petitionId: string) => {
    playTacticalClick();
    const target = petitions.find(p => p.id === petitionId);
    if (!target) return;

    const supporterName = currentUser?.fullName || 'Squadron Pilot';
    const supporterModel = currentUser?.motorcycleModel || 'F77 MACH 2';

    const optimistic = togglePetitionSupport(target, {
      voterId: effectiveVoterId,
      supporterName,
      supporterModel
    });
    const optimisticList = petitions.map(p => (p.id === petitionId ? optimistic : p));
    setPetitions(optimisticList);
    saveToCache(CACHE_KEYS.PETITIONS, optimisticList);

    try {
      const res = await fetch(`/api/discussions/petitions/${petitionId}/support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterId: effectiveVoterId,
          supporterName,
          supporterModel
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.petition) {
          playChime();
          const syncedList = petitions.map(p => (p.id === petitionId ? data.petition : p));
          setPetitions(syncedList);
          saveToCache(CACHE_KEYS.PETITIONS, syncedList);
        }
      }
    } catch {
      // Optimistic support already saved in cache
    }
  };

  const handleDeletePetition = async (petition: DiscussionPetition) => {
    playTacticalClick();
    recordDeletedId(petition.id);
    const next = petitions.filter(p => p.id !== petition.id);
    setPetitions(next);
    saveToCache(CACHE_KEYS.PETITIONS, next);

    try {
      await fetch(`/api/discussions/petitions/${petition.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterId: effectiveVoterId })
      });
      setStatusNotice({ type: 'saved', text: 'Petition removed.' });
      setTimeout(() => setStatusNotice(null), 3500);
    } catch {
      // Already removed locally
    }
  };

  const openEditPost = (post: DiscussionPost) => {
    playTacticalClick();
    setEditingPostId(post.id);
    setTitle(post.title);
    setCategory(post.category);
    setContent(post.content);
    setTagsInput((post.tags || []).join(', '));
    setShowCreateModal(true);
  };

  const handleDeletePost = async (post: DiscussionPost) => {
    if (!currentUser) return;
    playTacticalClick();
    recordDeletedId(post.id);
    try {
      const res = await fetch(`/api/discussions/${post.id}?userId=${encodeURIComponent(currentUser.id)}`, {
        method: 'DELETE',
        headers: { 'x-user-id': currentUser.id }
      });
      if (res.ok || (post as any).pendingSync) {
        const next = discussions.filter(d => d.id !== post.id);
        setDiscussions(next);
        saveToCache(CACHE_KEYS.DISCUSSIONS, next);
        if (selectedPost?.id === post.id) {
          setSelectedPost(next[0] || null);
        }
        setStatusNotice({ type: 'saved', text: 'Discussion thread deleted permanently.' });
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch {
      const next = discussions.filter(d => d.id !== post.id);
      setDiscussions(next);
      saveToCache(CACHE_KEYS.DISCUSSIONS, next);
      if (selectedPost?.id === post.id) {
        setSelectedPost(next[0] || null);
      }
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!selectedPost || !currentUser) return;
    playTacticalClick();
    recordDeletedId(commentId);
    try {
      const res = await fetch(`/api/discussions/${selectedPost.id}/comments/${commentId}?userId=${encodeURIComponent(currentUser.id)}`, {
        method: 'DELETE',
        headers: { 'x-user-id': currentUser.id }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.post) {
          const next = discussions.map(d => (d.id === data.post.id ? data.post : d));
          setDiscussions(next);
          saveToCache(CACHE_KEYS.DISCUSSIONS, next);
          setSelectedPost(data.post);
        }
      }
    } catch {
      const updatedPost: DiscussionPost = {
        ...selectedPost,
        comments: selectedPost.comments.filter(c => c.id !== commentId)
      };
      const next = discussions.map(d => (d.id === selectedPost.id ? updatedPost : d));
      setDiscussions(next);
      saveToCache(CACHE_KEYS.DISCUSSIONS, next);
      setSelectedPost(updatedPost);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;

    playTacticalClick();
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    const clientRequestId = `dsc_req_${Date.now()}`;
    const payload = {
      userId: currentUser?.id,
      authorId: currentUser?.id,
      authorName: currentUser?.fullName || 'Squadron Pilot',
      authorModel: currentUser?.motorcycleModel || 'F77 MACH 2',
      category,
      title,
      content,
      tags,
      clientRequestId
    };

    try {
      const url = editingPostId ? `/api/discussions/${editingPostId}` : '/api/discussions';
      const method = editingPostId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || '',
          'x-client-request-id': clientRequestId
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        playChime();
        clearFormDraft(DRAFT_KEY);
        setShowCreateModal(false);
        setEditingPostId(null);
        setTitle('');
        setContent('');
        setTagsInput('');
        if (data.post) {
          const updatedList = editingPostId
            ? discussions.map(d => (d.id === data.post.id ? data.post : d))
            : [data.post, ...discussions.filter(d => d.id !== data.post.id)];
          setDiscussions(updatedList);
          saveToCache(CACHE_KEYS.DISCUSSIONS, updatedList);
          setSelectedPost(data.post);
        }
        setStatusNotice({
          type: 'saved',
          text: editingPostId ? 'Discussion updated and saved permanently.' : 'Discussion published and saved permanently.'
        });
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch {
      enqueueOfflineAction(
        editingPostId ? `/api/discussions/${editingPostId}` : '/api/discussions',
        editingPostId ? 'PUT' : 'POST',
        payload,
        'Community Discussion',
        clientRequestId
      );
      const localPost: any = {
        ...payload,
        id: editingPostId || `dsc_local_${Date.now()}`,
        createdAt: new Date().toISOString(),
        pinned: false,
        reactions: { helpful: [], salute: [], confirmed: [] },
        comments: [],
        pendingSync: true
      };
      const updated = editingPostId
        ? discussions.map(d => (d.id === editingPostId ? localPost : d))
        : [localPost, ...discussions];
      setDiscussions(updated);
      saveToCache(CACHE_KEYS.DISCUSSIONS, updated);
      setSelectedPost(localPost);
      clearFormDraft(DRAFT_KEY);
      setShowCreateModal(false);
      setEditingPostId(null);
      setStatusNotice({
        type: 'offline',
        text: 'Saved locally — pending sync. Your discussion will automatically publish when connection returns.'
      });
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost || !commentInput.trim()) return;

    playTacticalClick();
    const clientRequestId = `cmt_req_${Date.now()}`;
    const payload = {
      userId: currentUser?.id,
      authorId: currentUser?.id,
      authorName: currentUser?.fullName || 'Squadron Pilot',
      content: commentInput,
      clientRequestId
    };

    try {
      const res = await fetch(`/api/discussions/${selectedPost.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || '',
          'x-client-request-id': clientRequestId
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        playChime();
        setCommentInput('');
        if (data.post) {
          const next = discussions.map(d => (d.id === data.post.id ? data.post : d));
          setDiscussions(next);
          saveToCache(CACHE_KEYS.DISCUSSIONS, next);
          setSelectedPost(data.post);
        }
      }
    } catch {
      enqueueOfflineAction(
        `/api/discussions/${selectedPost.id}/comments`,
        'POST',
        payload,
        'Community Answer Reply',
        clientRequestId
      );
      const updatedPost: DiscussionPost = {
        ...selectedPost,
        comments: [
          ...selectedPost.comments,
          {
            id: `cmt_local_${Date.now()}`,
            authorId: currentUser?.id || 'u_local',
            authorName: currentUser?.fullName || 'Squadron Pilot',
            content: commentInput,
            createdAt: new Date().toISOString()
          }
        ]
      };
      const next = discussions.map(d => (d.id === selectedPost.id ? updatedPost : d));
      setDiscussions(next);
      saveToCache(CACHE_KEYS.DISCUSSIONS, next);
      setSelectedPost(updatedPost);
      setCommentInput('');
      setStatusNotice({
        type: 'offline',
        text: 'Reply saved locally — pending sync.'
      });
    }
  };

  const handleReaction = async (reactionType: 'helpful' | 'salute' | 'confirmed') => {
    if (!selectedPost || !currentUser) return;
    playTacticalClick();

    try {
      const res = await fetch(`/api/discussions/${selectedPost.id}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          reactionType
        })
      });
      if (res.ok) {
        const data = await res.json();
        const updatedPost: DiscussionPost = data.post
          ? data.post
          : data.reactions
          ? { ...selectedPost, reactions: data.reactions }
          : selectedPost;
        const next = discussions.map(d => (d.id === updatedPost.id ? updatedPost : d));
        setDiscussions(next);
        saveToCache(CACHE_KEYS.DISCUSSIONS, next);
        setSelectedPost(updatedPost);
      }
    } catch (err) {
      console.error('Reaction error:', err);
    }
  };

  const filteredDiscussions = discussions.filter(d => {
    if (categoryFilter !== 'ALL' && d.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !d.content.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const filteredPolls = polls.filter(p => {
    if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const optionMatch = (p.options || []).some(o => o.text.toLowerCase().includes(q));
      if (!p.question.toLowerCase().includes(q) && !optionMatch) {
        return false;
      }
    }
    return true;
  });

  const filteredPetitions = petitions.filter(pet => {
    if (categoryFilter !== 'ALL' && pet.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!pet.title.toLowerCase().includes(q) && !pet.description.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#13161A] border border-[#282D34] rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded bg-[#191D22] border border-[#414851] flex items-center justify-center text-[#D4D8DE]">
            <MessageCircle className="w-5 h-5 text-[#42B883]" />
          </div>
          <div>
            <div className="text-sm font-mono font-bold text-[#F1F3F5] tracking-wider flex items-center gap-2">
              <span data-testid="discussion-page-heading">DISCUSSION</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#252A30] text-[#42B883] border border-[#42B883]/30">
                THREADS • POLLS • PETITIONS
              </span>
            </div>
            <div className="text-xs text-[#A0A7B0] mt-0.5">
              Community discussions • Live squadron polls • Rider petitions &amp; support • Technical insights
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-testid="open-create-poll-btn"
            onClick={() => {
              playTacticalClick();
              setPollError(null);
              setShowCreatePollModal(true);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded bg-[#19232C] hover:bg-[#223240] text-xs font-mono font-bold text-[#38BDF8] border border-[#38BDF8]/40 transition-colors cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>CONDUCT POLL</span>
          </button>

          <button
            type="button"
            data-testid="open-create-petition-btn"
            onClick={() => {
              playTacticalClick();
              setPetitionError(null);
              setShowCreatePetitionModal(true);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded bg-[#261E11] hover:bg-[#332816] text-xs font-mono font-bold text-[#F59E0B] border border-[#F59E0B]/40 transition-colors cursor-pointer"
          >
            <FileSignature className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>START PETITION</span>
          </button>

          <button
            type="button"
            data-testid="open-create-discussion-btn"
            onClick={() => {
              playTacticalClick();
              setEditingPostId(null);
              setShowCreateModal(true);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded bg-[#252A30] hover:bg-[#414851] text-xs font-mono font-bold text-[#F1F3F5] border border-[#414851] transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#42B883]" />
            <span>NEW DISCUSSION</span>
          </button>
        </div>
      </div>

      {statusNotice && (
        <div
          className={`p-3 rounded-lg border text-xs font-mono flex items-center justify-between ${
            statusNotice.type === 'saved'
              ? 'bg-[#42B883]/15 border-[#42B883]/40 text-[#42B883]'
              : 'bg-[#E8AA45]/15 border-[#E8AA45]/40 text-[#E8AA45]'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotice.type === 'offline' ? <CloudOff className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{statusNotice.text}</span>
          </div>
          <button onClick={() => setStatusNotice(null)} className="text-[#707883] hover:text-[#F1F3F5]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Section Mode Selector + Category Tabs & Search */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#282D34] pb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <button
              type="button"
              data-testid="section-tab-all"
              onClick={() => {
                playTacticalClick();
                setActiveSectionView('all');
              }}
              className={`relative px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                activeSectionView === 'all'
                  ? 'text-[#F1F3F5] border-transparent font-bold'
                  : 'bg-[#0D0F12] text-[#707883] border-[#282D34] hover:text-[#D4D8DE]'
              }`}
            >
              {activeSectionView === 'all' && (
                <motion.span
                  layoutId="discussion-section-view-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#42B883]/50"
                />
              )}
              <span className="relative z-10">
                ALL ({filteredDiscussions.length + filteredPolls.length + filteredPetitions.length})
              </span>
            </button>
            <button
              type="button"
              data-testid="section-tab-polls"
              onClick={() => {
                playTacticalClick();
                setActiveSectionView('polls');
              }}
              className={`relative px-3 py-1.5 rounded border transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSectionView === 'polls'
                  ? 'text-[#38BDF8] border-transparent font-bold'
                  : 'bg-[#0D0F12] text-[#707883] border-[#282D34] hover:text-[#D4D8DE]'
              }`}
            >
              {activeSectionView === 'polls' && (
                <motion.span
                  layoutId="discussion-section-view-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="pointer-events-none absolute inset-0 rounded bg-[#19232C] border border-[#38BDF8]/50"
                />
              )}
              <Vote className="relative z-10 w-3.5 h-3.5" />
              <span className="relative z-10">POLLS SECTION ({filteredPolls.length})</span>
            </button>
            <button
              type="button"
              data-testid="section-tab-petitions"
              onClick={() => {
                playTacticalClick();
                setActiveSectionView('petitions');
              }}
              className={`relative px-3 py-1.5 rounded border transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSectionView === 'petitions'
                  ? 'text-[#F59E0B] border-transparent font-bold'
                  : 'bg-[#0D0F12] text-[#707883] border-[#282D34] hover:text-[#D4D8DE]'
              }`}
            >
              {activeSectionView === 'petitions' && (
                <motion.span
                  layoutId="discussion-section-view-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="pointer-events-none absolute inset-0 rounded bg-[#261E11] border border-[#F59E0B]/50"
                />
              )}
              <FileSignature className="relative z-10 w-3.5 h-3.5" />
              <span className="relative z-10">PETITIONS SECTION ({filteredPetitions.length})</span>
            </button>
            <button
              type="button"
              data-testid="section-tab-threads"
              onClick={() => {
                playTacticalClick();
                setActiveSectionView('threads');
              }}
              className={`relative px-3 py-1.5 rounded border transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSectionView === 'threads'
                  ? 'text-[#42B883] border-transparent font-bold'
                  : 'bg-[#0D0F12] text-[#707883] border-[#282D34] hover:text-[#D4D8DE]'
              }`}
            >
              {activeSectionView === 'threads' && (
                <motion.span
                  layoutId="discussion-section-view-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#42B883]/50"
                />
              )}
              <MessageCircle className="relative z-10 w-3.5 h-3.5" />
              <span className="relative z-10">DISCUSSION THREADS ({filteredDiscussions.length})</span>
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs font-mono">
          {['ALL', 'Battery & Charging', 'Technical Help', 'Software & Dashboard', 'Safety', 'Riding & Touring', 'Modifications', 'General Discussion'].map(cat => (
            <button
              key={cat}
              onClick={() => {
                playTacticalClick();
                setCategoryFilter(cat);
              }}
              className={`relative px-3 py-1.5 rounded transition-colors whitespace-nowrap cursor-pointer ${
                categoryFilter === cat
                  ? 'text-[#F1F3F5] font-semibold'
                  : 'text-[#707883] hover:text-[#AEB5BE]'
              }`}
            >
              {categoryFilter === cat && (
                <motion.span
                  layoutId="discussion-category-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="pointer-events-none absolute inset-0 rounded bg-[#191D22] border border-[#414851]"
                />
              )}
              <span className="relative z-10">{cat}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#707883]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search discussions, polls, or petitions by keyword, topic, or option..."
            className="w-full bg-[#0D0F12] border border-[#282D34] focus:border-[#414851] rounded pl-9 pr-3 py-2 text-xs font-mono text-[#F1F3F5] placeholder-[#707883] focus:outline-none"
          />
        </div>
      </div>

      <AvionicsToggleTransition
        activeKey={activeSectionView}
        orderedKeys={['all', 'polls', 'petitions', 'threads']}
        accentColor={
          activeSectionView === 'polls'
            ? 'sky'
            : activeSectionView === 'petitions'
            ? 'amber'
            : 'emerald'
        }
        reducedMotion={reducedMotion}
        className="space-y-6"
      >
      {/* SEPARATE POLLS SECTION */}
      {(activeSectionView === 'all' || activeSectionView === 'polls') && (
        <section
          data-testid="discussion-polls-section"
          className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#282D34]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-[#19232C] border border-[#38BDF8]/40 flex items-center justify-center text-[#38BDF8]">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-mono font-bold text-[#F1F3F5] uppercase tracking-wider flex items-center gap-2">
                  <span>COMMUNITY POLLS</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#19232C] text-[#38BDF8] border border-[#38BDF8]/30">
                    {filteredPolls.length} ACTIVE
                  </span>
                </h3>
                <p className="text-[11px] text-[#A0A7B0]">
                  Conduct a poll for the squadron or cast your vote on active community questions.
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="section-conduct-poll-btn"
              onClick={() => {
                playTacticalClick();
                setPollError(null);
                setShowCreatePollModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#19232C] hover:bg-[#223240] text-[#38BDF8] border border-[#38BDF8]/40 text-xs font-mono font-bold transition-colors self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>CONDUCT A POLL</span>
            </button>
          </div>

          {filteredPolls.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPolls.map(poll => {
                const stats = calculatePollResults(poll, effectiveVoterId);
                const canDeletePoll =
                  canUserModifyRecord(currentUser, poll) || poll.authorId === effectiveVoterId;

                return (
                  <div
                    key={poll.id}
                    data-testid={`poll-card-${poll.id}`}
                    className="bg-[#13161A] border border-[#282D34] rounded-lg p-4 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="px-2 py-0.5 rounded bg-[#19232C] text-[#38BDF8] border border-[#38BDF8]/30 font-semibold">
                          {poll.category}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[#707883]" data-testid={`poll-total-votes-${poll.id}`}>
                            {stats.totalVotes} {stats.totalVotes === 1 ? 'VOTE' : 'VOTES'}
                          </span>
                          {canDeletePoll && (
                            <button
                              type="button"
                              onClick={() => handleDeletePoll(poll)}
                              className="p-1 rounded bg-[#191D22] hover:bg-[#E04F5F]/20 text-[#707883] hover:text-[#E04F5F]"
                              title="Delete Poll"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-[#F1F3F5] leading-snug">
                        {poll.question}
                      </h4>

                      <div className="space-y-2 pt-1">
                        {stats.options.map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            data-testid={`poll-option-${poll.id}-${opt.id}`}
                            onClick={() => handleVotePoll(poll.id, opt.id)}
                            className={`w-full text-left relative overflow-hidden rounded border p-2.5 transition-all cursor-pointer ${
                              opt.isSelected
                                ? 'bg-[#19232C]/90 border-[#38BDF8] text-[#F1F3F5]'
                                : 'bg-[#0D0F12] border-[#282D34] hover:border-[#414851] text-[#D4D8DE]'
                            }`}
                          >
                            {/* Progress fill bar */}
                            <div
                              className={`absolute inset-y-0 left-0 transition-all duration-300 pointer-events-none ${
                                opt.isSelected ? 'bg-[#38BDF8]/20' : 'bg-[#414851]/20'
                              }`}
                              style={{ width: `${opt.percentage}%` }}
                            />
                            <div className="relative z-10 flex items-center justify-between gap-2 text-xs font-mono">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 ${
                                    opt.isSelected
                                      ? 'border-[#38BDF8] bg-[#38BDF8] text-[#05070B]'
                                      : 'border-[#414851] bg-transparent'
                                  }`}
                                >
                                  {opt.isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                </span>
                                <span className="truncate font-sans">{opt.text}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 text-[11px] text-[#AEB5BE]">
                                <span>{opt.voteCount}</span>
                                <span className="font-bold text-[#F1F3F5] w-9 text-right">
                                  {opt.percentage}%
                                </span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2.5 border-t border-[#282D34] text-[10px] font-mono text-[#707883]">
                      <span>
                        Poll by <strong className="text-[#AEB5BE]">{poll.authorName}</strong> ({poll.authorModel})
                      </span>
                      <span>
                        {stats.selectedOptionId ? (
                          <span className="text-[#38BDF8] font-bold">✓ VOTE RECORDED</span>
                        ) : (
                          <span>CLICK AN OPTION TO VOTE</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 rounded bg-[#13161A] border border-[#282D34] text-center text-xs font-mono text-[#707883]">
              No active polls match your filter. Click &ldquo;CONDUCT A POLL&rdquo; to start one.
            </div>
          )}
        </section>
      )}

      {/* SEPARATE PETITIONS SECTION */}
      {(activeSectionView === 'all' || activeSectionView === 'petitions') && (
        <section
          data-testid="discussion-petitions-section"
          className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#282D34]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-[#261E11] border border-[#F59E0B]/40 flex items-center justify-center text-[#F59E0B]">
                <FileSignature className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-mono font-bold text-[#F1F3F5] uppercase tracking-wider flex items-center gap-2">
                  <span>COMMUNITY PETITIONS</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#261E11] text-[#F59E0B] border border-[#F59E0B]/30">
                    {filteredPetitions.length} ACTIVE
                  </span>
                </h3>
                <p className="text-[11px] text-[#A0A7B0]">
                  Conduct a petition for charging corridors, firmware features, or community initiatives where other users can support.
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="section-conduct-petition-btn"
              onClick={() => {
                playTacticalClick();
                setPetitionError(null);
                setShowCreatePetitionModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#261E11] hover:bg-[#332816] text-[#F59E0B] border border-[#F59E0B]/40 text-xs font-mono font-bold transition-colors self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>CONDUCT A PETITION</span>
            </button>
          </div>

          {filteredPetitions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPetitions.map(petition => {
                const progress = calculatePetitionProgress(petition, effectiveVoterId);
                const canDeletePetition =
                  canUserModifyRecord(currentUser, petition) ||
                  petition.authorId === effectiveVoterId;
                const recentSupporters = (petition.supporters || []).slice(-4).reverse();

                return (
                  <div
                    key={petition.id}
                    data-testid={`petition-card-${petition.id}`}
                    className="bg-[#13161A] border border-[#282D34] rounded-lg p-4 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="px-2 py-0.5 rounded bg-[#261E11] text-[#F59E0B] border border-[#F59E0B]/30 font-semibold">
                          {petition.category}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[#FDE68A] font-bold"
                            data-testid={`petition-supporter-count-${petition.id}`}
                          >
                            {progress.supporterCount} / {progress.targetGoal} SUPPORTERS
                          </span>
                          {canDeletePetition && (
                            <button
                              type="button"
                              onClick={() => handleDeletePetition(petition)}
                              className="p-1 rounded bg-[#191D22] hover:bg-[#E04F5F]/20 text-[#707883] hover:text-[#E04F5F]"
                              title="Delete Petition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-[#F1F3F5] leading-snug">
                        {petition.title}
                      </h4>

                      <p className="text-xs text-[#D4D8DE] font-sans leading-relaxed">
                        {petition.description}
                      </p>

                      {/* Petition Support Goal Bar */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-[#A0A7B0] flex items-center gap-1">
                            <Users className="w-3 h-3 text-[#F59E0B]" />
                            <span>SQUADRON SUPPORT PROGRESS</span>
                          </span>
                          <span className="text-[#F59E0B] font-bold">{progress.progressPercent}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#08090B] border border-[#282D34] overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#F59E0B] to-[#42B883] transition-all duration-300"
                            style={{ width: `${progress.progressPercent}%` }}
                          />
                        </div>
                      </div>

                      {recentSupporters.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] font-mono text-[#707883]">Backed by:</span>
                          {recentSupporters.map((sup, sIdx) => (
                            <span
                              key={`${sup.voterId}_${sIdx}`}
                              className="px-2 py-0.5 rounded bg-[#0D0F12] border border-[#282D34] text-[10px] font-mono text-[#AEB5BE]"
                            >
                              {sup.supporterName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#282D34]">
                      <div className="text-[10px] font-mono text-[#707883] truncate">
                        Started by <strong className="text-[#AEB5BE]">{petition.authorName}</strong> ({petition.authorModel})
                      </div>

                      <button
                        type="button"
                        data-testid={`petition-support-btn-${petition.id}`}
                        onClick={() => handleSupportPetition(petition.id)}
                        className={`px-3.5 py-1.5 rounded text-xs font-mono font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                          progress.isSupported
                            ? 'bg-[#42B883]/20 text-[#42B883] border-[#42B883]/60'
                            : 'bg-[#261E11] hover:bg-[#332816] text-[#FDE68A] border-[#F59E0B]/60'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{progress.isSupported ? 'SUPPORTED BY YOU' : 'SUPPORT PETITION'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 rounded bg-[#13161A] border border-[#282D34] text-center text-xs font-mono text-[#707883]">
              No active petitions match your filter. Click &ldquo;CONDUCT A PETITION&rdquo; to launch one.
            </div>
          )}
        </section>
      )}

      {/* DISCUSSION THREADS SECTION */}
      {(activeSectionView === 'all' || activeSectionView === 'threads') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            <div className="text-[11px] font-mono text-[#707883] flex items-center justify-between pb-1 border-b border-[#282D34]">
              <span>DISCUSSION FEED ({filteredDiscussions.length})</span>
              <span>SORT: RECENT</span>
            </div>

            {filteredDiscussions.map(post => {
              const isSelected = selectedPost?.id === post.id;
              const hasAnswers = post.comments && post.comments.length > 0;
              return (
                <div
                  key={post.id}
                  onClick={() => {
                    playTacticalClick();
                    setSelectedPost(post);
                  }}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#191D22] border-[#414851] shadow-lg ring-1 ring-[#414851]/50'
                      : 'bg-[#0D0F12] border-[#282D34] hover:border-[#414851]/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-[#13161A] text-[#729BCB] border border-[#282D34] font-semibold">
                        {post.category}
                      </span>
                      {(post as any).pendingSync && (
                        <span className="px-1.5 py-0.5 rounded bg-[#E8AA45]/20 text-[#E8AA45] border border-[#E8AA45]/40 font-bold">
                          PENDING SYNC
                        </span>
                      )}
                      {post.pinned && (
                        <span className="text-[#42B883] flex items-center gap-0.5 font-bold">
                          <Pin className="w-3 h-3" /> PINNED
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 ${
                        hasAnswers
                          ? 'bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/30'
                          : 'bg-[#252A30] text-[#A0A7B0] border border-[#414851]/40'
                      }`}
                    >
                      <MessageCircle className="w-3 h-3" />
                      {post.comments.length} {post.comments.length === 1 ? 'REPLY' : 'REPLIES'}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-[#F1F3F5] line-clamp-2 leading-snug">
                    {post.title}
                  </h4>

                  <p className="text-xs text-[#A0A7B0] line-clamp-2 mt-1.5 font-sans leading-relaxed">
                    {post.content}
                  </p>

                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#282D34] text-[10px] font-mono text-[#707883]">
                    <span>Posted by {post.authorName} ({post.authorModel})</span>
                    <span>{new Date(post.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              );
            })}

            {filteredDiscussions.length === 0 && (
              <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-8 text-center text-xs font-mono text-[#707883]">
                No discussions found matching criteria.
              </div>
            )}
          </div>

          {/* Selected Discussion Detail */}
          <div className="lg:col-span-7">
            {selectedPost ? (
              <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-6 space-y-6 text-xs font-mono">
                <div className="space-y-3 pb-4 border-b border-[#282D34]">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#729BCB]/20 text-[#729BCB] border border-[#729BCB]/40 font-bold tracking-wider">
                        DISCUSSION
                      </span>
                      <span className="text-[#AEB5BE] font-semibold">{selectedPost.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {canUserModifyRecord(currentUser, selectedPost) && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditPost(selectedPost)}
                            className="p-1 rounded bg-[#191D22] hover:bg-[#252A30] text-[#AEB5BE] hover:text-[#F1F3F5] border border-[#282D34]"
                            title="Edit Discussion"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(selectedPost)}
                            className="p-1 rounded bg-[#191D22] hover:bg-[#E04F5F]/20 text-[#AEB5BE] hover:text-[#E04F5F] border border-[#282D34]"
                            title="Delete Discussion"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <span className="text-[#707883]">
                        {new Date(selectedPost.createdAt).toLocaleDateString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>

                  <h2 className="text-lg font-bold text-[#FFFFFF] tracking-tight leading-snug">
                    {selectedPost.title}
                  </h2>

                  <div className="text-[11px] text-[#A0A7B0] flex items-center gap-2">
                    <span className="text-[#707883]">Posted by</span>
                    <span className="text-[#F1F3F5] font-semibold">{selectedPost.authorName}</span>
                    <span className="text-[#707883]">•</span>
                    <span className="text-[#AEB5BE]">{selectedPost.authorModel}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] text-[#707883] uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-[#729BCB]" />
                    <span>DISCUSSION DETAILS</span>
                  </div>
                  <div className="text-[#D4D8DE] bg-[#13161A] p-4 rounded-lg border border-[#282D34] font-sans text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedPost.content}
                  </div>
                </div>

                {selectedPost.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPost.tags.map((t, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-[#13161A] text-[10px] text-[#AEB5BE] border border-[#282D34]"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#282D34]">
                  <button
                    onClick={() => handleReaction('helpful')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] text-xs text-[#D4D8DE] transition-colors"
                  >
                    <ThumbsUp className="w-3.5 h-3.5 text-[#42B883]" />
                    <span>HELPFUL ({selectedPost.reactions.helpful.length})</span>
                  </button>
                  <button
                    onClick={() => handleReaction('salute')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] text-xs text-[#D4D8DE] transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5 text-[#729BCB]" />
                    <span>SALUTE ({selectedPost.reactions.salute.length})</span>
                  </button>
                  <button
                    onClick={() => handleReaction('confirmed')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#13161A] border border-[#282D34] hover:border-[#414851] text-xs text-[#D4D8DE] transition-colors"
                  >
                    <Check className="w-3.5 h-3.5 text-[#E8AA45]" />
                    <span>CONFIRMED ({selectedPost.reactions.confirmed.length})</span>
                  </button>
                </div>

                <div className="space-y-4 pt-4 border-t border-[#282D34]">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-[#F1F3F5] uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#42B883]" />
                      <span>REPLIES ({selectedPost.comments.length})</span>
                    </div>
                    <span className="text-[10px] text-[#707883]">SQUADRON RESPONSES</span>
                  </div>

                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {selectedPost.comments.map((c, idx) => (
                      <div key={c.id} className="p-4 rounded-lg bg-[#13161A] border border-[#282D34] space-y-2">
                        <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-[#282D34]/70">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.2 rounded bg-[#252A30] text-[#42B883] text-[9px] font-bold border border-[#42B883]/30">
                              REPLY #{idx + 1}
                            </span>
                            <span className="text-[#F1F3F5] font-semibold">{c.authorName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[#707883]">
                              {new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                              {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {canUserModifyRecord(currentUser, c) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(c.id)}
                                className="p-1 rounded bg-[#191D22] hover:bg-[#E04F5F]/20 text-[#707883] hover:text-[#E04F5F]"
                                title="Delete Reply"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-[#D4D8DE] font-sans leading-relaxed whitespace-pre-wrap pl-1">
                          {c.content}
                        </div>
                      </div>
                    ))}

                    {selectedPost.comments.length === 0 && (
                      <div className="p-5 rounded bg-[#13161A]/60 border border-[#282D34] text-center text-xs text-[#707883] font-sans">
                        No replies submitted yet. Be the first squadron pilot to share your thoughts.
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-lg bg-[#13161A] border border-[#414851]/60 space-y-2.5">
                    <div className="text-[11px] font-mono font-bold text-[#F1F3F5] flex items-center gap-1.5">
                      <CornerDownRight className="w-3.5 h-3.5 text-[#42B883]" />
                      <span>ADD YOUR REPLY</span>
                    </div>
                    <form onSubmit={handleAddComment} className="space-y-2.5">
                      <textarea
                        rows={3}
                        value={commentInput}
                        onChange={e => setCommentInput(e.target.value)}
                        placeholder="Type your reply, telemetry verification, or recommendation..."
                        className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#414851] rounded p-3 text-[#F1F3F5] text-xs font-sans focus:outline-none leading-relaxed"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#707883] font-mono">
                          Ground advice on Ultraviolette factory specs or verified ride experience.
                        </span>
                        <button
                          type="submit"
                          disabled={!commentInput.trim()}
                          className="px-4 py-2 rounded bg-[#252A30] hover:bg-[#414851] disabled:opacity-40 text-[#F1F3F5] font-bold border border-[#414851] text-xs font-mono transition-colors"
                        >
                          SUBMIT REPLY
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#0D0F12] border border-[#282D34] rounded-lg p-12 text-center text-xs font-mono text-[#707883]">
                SELECT A DISCUSSION THREAD TO VIEW DETAILS AND REPLIES
              </div>
            )}
          </div>
        </div>
      )}
      </AvionicsToggleTransition>

      {/* Modal: Conduct a Poll */}
      {showCreatePollModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div
            data-testid="create-poll-modal"
            className="bg-[#13161A] border border-[#38BDF8]/50 rounded-lg max-w-lg w-full p-6 space-y-4 font-mono text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="text-sm font-bold text-[#F1F3F5] pb-2 border-b border-[#282D34] flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#38BDF8]" />
                <span>CONDUCT A COMMUNITY POLL</span>
              </span>
              <button
                type="button"
                onClick={() => setShowCreatePollModal(false)}
                className="text-[#707883] hover:text-[#F1F3F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pollError && (
              <div className="p-2.5 rounded bg-[#E04F5F]/15 border border-[#E04F5F]/40 text-[#E04F5F] text-[11px]">
                {pollError}
              </div>
            )}

            <form onSubmit={handleCreatePoll} className="space-y-3.5">
              {!currentUser && (
                <div>
                  <label className="block text-[#D4D8DE] mb-1 font-semibold">YOUR NAME / CALLSIGN</label>
                  <input
                    type="text"
                    data-testid="poll-author-input"
                    value={pollAuthorName}
                    onChange={e => setPollAuthorName(e.target.value)}
                    placeholder="e.g. Squadron Pilot"
                    className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#38BDF8] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[#D4D8DE] mb-1 font-semibold">POLL QUESTION *</label>
                <input
                  type="text"
                  data-testid="poll-question-input"
                  value={pollQuestion}
                  onChange={e => setPollQuestion(e.target.value)}
                  placeholder="e.g. Which tyre compound gives the best grip on wet ghats?"
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#38BDF8] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1 font-semibold">CATEGORY *</label>
                <select
                  value={pollCategory}
                  onChange={e => setPollCategory(e.target.value)}
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#38BDF8] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                >
                  <option value="General Discussion">General Discussion</option>
                  <option value="Riding & Touring">Riding & Touring</option>
                  <option value="Battery & Charging">Battery & Charging</option>
                  <option value="Technical Help">Technical Help</option>
                  <option value="Software & Dashboard">Software & Dashboard</option>
                  <option value="Modifications">Modifications</option>
                  <option value="Safety">Safety</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[#D4D8DE] font-semibold">
                    POLL OPTIONS (MIN 2, MAX 6) *
                  </label>
                  {pollOptions.length < 6 && (
                    <button
                      type="button"
                      data-testid="add-poll-option-btn"
                      onClick={handleAddPollOptionField}
                      className="text-[11px] text-[#38BDF8] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> ADD OPTION
                    </button>
                  )}
                </div>

                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      data-testid={`poll-option-input-${idx}`}
                      value={opt}
                      onChange={e => handlePollOptionChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 bg-[#08090B] border border-[#282D34] focus:border-[#38BDF8] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                      required={idx < 2}
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePollOptionField(idx)}
                        className="p-2 rounded bg-[#191D22] text-[#707883] hover:text-[#E04F5F] border border-[#282D34]"
                        title="Remove option"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#282D34]">
                <button
                  type="button"
                  onClick={() => setShowCreatePollModal(false)}
                  className="px-3 py-1.5 rounded bg-[#191D22] text-[#A0A7B0] hover:text-[#F1F3F5]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  data-testid="submit-poll-btn"
                  className="px-4 py-2 rounded bg-[#19232C] hover:bg-[#223240] text-[#38BDF8] border border-[#38BDF8]/50 font-bold cursor-pointer"
                >
                  PUBLISH POLL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Conduct a Petition */}
      {showCreatePetitionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div
            data-testid="create-petition-modal"
            className="bg-[#13161A] border border-[#F59E0B]/50 rounded-lg max-w-lg w-full p-6 space-y-4 font-mono text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="text-sm font-bold text-[#F1F3F5] pb-2 border-b border-[#282D34] flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-[#F59E0B]" />
                <span>CONDUCT A COMMUNITY PETITION</span>
              </span>
              <button
                type="button"
                onClick={() => setShowCreatePetitionModal(false)}
                className="text-[#707883] hover:text-[#F1F3F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {petitionError && (
              <div className="p-2.5 rounded bg-[#E04F5F]/15 border border-[#E04F5F]/40 text-[#E04F5F] text-[11px]">
                {petitionError}
              </div>
            )}

            <form onSubmit={handleCreatePetition} className="space-y-3.5">
              {!currentUser && (
                <div>
                  <label className="block text-[#D4D8DE] mb-1 font-semibold">YOUR NAME / CALLSIGN</label>
                  <input
                    type="text"
                    data-testid="petition-author-input"
                    value={petitionAuthorName}
                    onChange={e => setPetitionAuthorName(e.target.value)}
                    placeholder="e.g. Squadron Pilot"
                    className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#F59E0B] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[#D4D8DE] mb-1 font-semibold">PETITION TITLE *</label>
                <input
                  type="text"
                  data-testid="petition-title-input"
                  value={petitionTitle}
                  onChange={e => setPetitionTitle(e.target.value)}
                  placeholder="e.g. Deploy UV Supernova Fast Charger on NH 44 Devanahalli Highway"
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#F59E0B] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#D4D8DE] mb-1 font-semibold">CATEGORY *</label>
                  <select
                    value={petitionCategory}
                    onChange={e => setPetitionCategory(e.target.value)}
                    className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#F59E0B] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                  >
                    <option value="General Discussion">General Discussion</option>
                    <option value="Battery & Charging">Battery & Charging</option>
                    <option value="Software & Dashboard">Software & Dashboard</option>
                    <option value="Service & Repairs">Service & Repairs</option>
                    <option value="Riding & Touring">Riding & Touring</option>
                    <option value="Modifications">Modifications</option>
                    <option value="Safety">Safety</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#D4D8DE] mb-1 font-semibold">TARGET SUPPORTERS GOAL</label>
                  <input
                    type="number"
                    min={5}
                    max={10000}
                    data-testid="petition-goal-input"
                    value={petitionTargetGoal}
                    onChange={e => setPetitionTargetGoal(Number(e.target.value) || 25)}
                    className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#F59E0B] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1 font-semibold">
                  PETITION OBJECTIVE &amp; DETAILS *
                </label>
                <textarea
                  rows={4}
                  data-testid="petition-description-input"
                  value={petitionDescription}
                  onChange={e => setPetitionDescription(e.target.value)}
                  placeholder="Describe why this initiative matters to the Ultraviolette rider community and what outcome is requested..."
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#F59E0B] rounded p-2.5 text-[#F1F3F5] focus:outline-none leading-relaxed font-sans"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#282D34]">
                <button
                  type="button"
                  onClick={() => setShowCreatePetitionModal(false)}
                  className="px-3 py-1.5 rounded bg-[#191D22] text-[#A0A7B0] hover:text-[#F1F3F5]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  data-testid="submit-petition-btn"
                  className="px-4 py-2 rounded bg-[#261E11] hover:bg-[#332816] text-[#FDE68A] border border-[#F59E0B]/60 font-bold cursor-pointer"
                >
                  PUBLISH PETITION
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New / Edit Discussion */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#13161A] border border-[#414851] rounded-lg max-w-lg w-full p-6 space-y-4 font-mono text-xs max-h-[90vh] overflow-y-auto">
            <div className="text-sm font-bold text-[#F1F3F5] pb-2 border-b border-[#282D34] flex items-center justify-between">
              <span>{editingPostId ? 'EDIT DISCUSSION' : 'START A NEW DISCUSSION'}</span>
              <span className="text-[10px] text-[#42B883]">DISCUSSION</span>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-3.5">
              <div>
                <label className="block text-[#D4D8DE] mb-1 font-semibold">DISCUSSION TITLE *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. How to prevent battery thermal derate during high-speed highway touring?"
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#414851] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1 font-semibold">CATEGORY *</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as any)}
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#414851] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                >
                  <option value="Technical Help">Technical Help</option>
                  <option value="Battery & Charging">Battery & Charging</option>
                  <option value="Software & Dashboard">Software & Dashboard</option>
                  <option value="Service & Repairs">Service & Repairs</option>
                  <option value="Accessories">Accessories</option>
                  <option value="Modifications">Modifications</option>
                  <option value="Riding & Touring">Riding & Touring</option>
                  <option value="Safety">Safety</option>
                  <option value="Ownership Experience">Ownership Experience</option>
                  <option value="General Discussion">General Discussion</option>
                </select>
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1 font-semibold">TAGS (COMMA SEPARATED)</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)}
                  placeholder="BMS, FastCharging, ThermalManagement, F77"
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#414851] rounded p-2.5 text-[#F1F3F5] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#D4D8DE] mb-1 font-semibold">DETAILS &amp; CONTEXT *</label>
                <textarea
                  rows={4}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Provide all relevant context, vehicle model, ambient conditions, operating speed, and warning codes..."
                  className="w-full bg-[#08090B] border border-[#282D34] focus:border-[#414851] rounded p-2.5 text-[#F1F3F5] focus:outline-none leading-relaxed font-sans"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#282D34]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded bg-[#191D22] text-[#A0A7B0] hover:text-[#F1F3F5]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-[#252A30] hover:bg-[#414851] text-[#F1F3F5] border border-[#414851] font-bold"
                >
                  {editingPostId ? 'SAVE CHANGES' : 'PUBLISH DISCUSSION'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
