-- Migration: Add highlighting_data column to conversation_messages table
-- Run this if the column doesn't exist yet

ALTER TABLE conversation_messages 
ADD COLUMN IF NOT EXISTS highlighting_data JSONB;
