// READ
import CommonsController from './commonsController.js';
import Logger from '../utils/Logger.js';
import APIError from '../errorHandling/apiError.js';
import { NextFunction, Request, Response } from 'express';
import TagService from '../services/tagService.js';
import joi from 'joi';
import { MYFIN } from '../consts.js';

const getFilteredTagsByPageSchema = joi
  .object({
    page_size: joi.number().default(MYFIN.DEFAULT_TRANSACTIONS_FETCH_LIMIT).min(1).max(300),
    query: joi.string().empty('').default(''),
  })
  .unknown(true);

const getAllTagsForUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await getFilteredTagsByPageSchema.validateAsync(req.query);
    const list = await TagService.getFilteredTagsForUserByPage(
      sessionData.userId,
      Number(req.params.page),
      input.page_size,
      input.query
    );

    res.json(list);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// CREATE

const createTagSchema = joi.object({
  name: joi.string().trim().required(),
  description: joi.string().trim().optional().allow(""),
});

const createTag = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await createTagSchema.validateAsync(req.body);
    await TagService.createTag({
      users_user_id: sessionData.userId,
      name: input.name,
      description: input.description,
    });
    res.json('Tag successfully created!');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// DELETE

const deleteTag = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const tagId = req.params.id;

    await TagService.deleteTag(sessionData.userId, BigInt(tagId));

    res.json('Tag successfully deleted!');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// UPDATE
const updateTagSchema = joi.object({
  new_name: joi.string().trim().required(),
  new_description: joi.string().trim().optional().allow(""),
});

const updateTag = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await updateTagSchema.validateAsync(req.body);
    const tagId = req.params.id;

    await TagService.updateTag(sessionData.userId, BigInt(tagId), {
      name: input.new_name,
      description: input.new_description,
    });
    res.json('Tag successfully updated!');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

export default {
  getAllTagsForUser,
  createTag,
  deleteTag,
  updateTag,
};
